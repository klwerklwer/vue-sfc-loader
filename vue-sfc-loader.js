(()=>{
	//加载配置
	class LoadConfig{
		/**
		 * 
		 * @param {object} values 
		 */
		constructor( values = {} ){
			this.baseUrl = ''
			//组件别名 重命名
			this.alias = ''
			this.queryString = ''
			this.constructor.setValues( this , values )
		}
		/**
		 * 
		 * @returns {LoadConfig}
		 */
		clone( values = {} ){
			const ret = new this.constructor( this )
			this.constructor.setValues( ret , values )
			return ret 
		}
		/**
		 * 
		 * @param {LoadConfig} options 
		 * @param {object} values 
		 */
		static setValues( options , values ){
			Object.entries( values ).forEach( ([ key , value ])=>{
				if( options.hasOwnProperty( key ) ){
					options[ key ] = value
				}
			})
		}
	}

	//全局默认加载配置
	const globalConfig = new LoadConfig

	function globalVue(){
		return globalThis.Vue
	}
	function validateGlobalVue(){
		if( !globalVue() ){
			throw new Error( '缺少vue' )
		}
	}

	const loadedUrls = new Set

	function addQueryString( url , queryString ){
		if( !url || !queryString ){
			return url
		}
		if( !url.includes("?") ){
			url += "?"
		}

		return url + "&" + queryString
	}

	const loadedResult = new Map
	

	//本体
	globalThis.vueSfcLoader = new class{
		/**
		 * 
		 * @param {string} path 
		 * @param {object} options 
		 * @returns {object}
		 */
		load( path , options = {}){
			//配置初始化
			const load_config = globalConfig.clone( options )

			//解析
			let url = path.match( /^.*\//g )?.[0] ?? ''
			path = path.substring( url.length )
			let query_params = path.match( /\?.*$/g )?.[0] ?? ''
			path = path.substring( 0 , path.length - query_params.length )
			//文件
			let urn = path
			if( !/\.vue$/i.test( urn ) ){
				urn += ".vue"
			}
	
			let { baseUrl } = load_config
			if( baseUrl[ baseUrl.length - 1 ] != "/"  && url[0] != "/" ){
				baseUrl += "/"
			}
			const { queryString } = load_config

			//完整资源路径
			const uri = addQueryString( baseUrl + url + urn + query_params , queryString )

			if( loadedResult.has( uri ) ){
				return loadedResult.get( uri )
			}
			const componentName = load_config.alias || urn.substring( 0 , urn.length - 4 )
	
			/**
			 * 
			 * @returns {Promise}
			 */
			const componentLoader = async function(){
				const file_promise = await fetch( uri )
				if( !file_promise.ok ){
					throw Object.assign( new Error( file_promise.statusText + ' ' + uri), { file_promise } )
				}
	
				const file_content = await file_promise.text()
				const component_data = {}
	
				//创建document
				const doc = (new DOMParser).parseFromString( file_content , 'text/html' )

				if( !doc.querySelector("base") ){
					doc.head.appendChild( doc.createElement( "base" ) ).href = baseUrl
				}

				/**
				 * 处理脚本
				 * 额外添加vue3没有的sfc解析功能,
				 * 含有src属性的脚本会被动态加入到页面上,这样的脚本可以有多个,且async属性是false的脚本视为同步,
				 * exports的脚本会在同步后执行
				 */
				const script_elts = doc.querySelectorAll( 'script' )
				let script_promise = Promise.resolve()
				if( script_elts.length ){
					script_promise = (async()=>{
						//同步,src脚本promise
						const script_load_promises = []
						let main_script
						for( let elt of script_elts ){
							if( elt.src ){
								let src = addQueryString( elt.src , queryString )
								if( loadedUrls.has( src ) ){
									continue
								}
								else{
									loadedUrls.add( src )
								}
								/**
								 * 直接使用源elt插入时,src不请求,不知道原因
								 * cloneNode(true) 得到的elt 也是同样的问题, 不得已只能创建elt赋值属性
								 */
								const clone_elt = document.createElement( 'script' )
								clone_elt.async = elt.async
								clone_elt.defer = elt.defer
								clone_elt.src = src
								if( !clone_elt.async ){
									script_load_promises.push(
										new Promise( (resolve) => {
											clone_elt.onload = resolve
											clone_elt.onerror = resolve
										})
									)
								}
								document.head.append( clone_elt )

							}
							else if( elt.textContent.trim() && !main_script ){
								//exports 脚本 , 参数的内容其实可以魔改
								main_script = Function( "module" , "baseUrl" , elt.textContent )
							}
						}
	
						if( main_script ){
							//阻塞同步加载
							if( script_load_promises.length ){
								await Promise.all( script_load_promises )
							}
							const module = {
								exports : {}
							}
							main_script.call( globalThis , module , baseUrl + url )
							
							if( module.exports ){
								//处理异步组件继承
								if( module.exports.extends?.__asyncLoader ){
									const asyncCompOptions = module.exports.extends.__asyncResolved ?? await module.exports.extends.__asyncLoader()
									module.exports.props = {
										...asyncCompOptions.props,
										...module.exports.props,
									}
								}
								Object.assign( component_data , module.exports )
							}
							
						}
					})();
				}

				const link_elt = doc.querySelectorAll("link")
				for( let elt of link_elt ){
					let href = addQueryString( elt.href , queryString )
				    if( href && !loadedUrls.has( href ) ){
						const link = elt.cloneNode()
						link.href = href
						document.head.append( link )
						loadedUrls.add( href )
					}
				}
	
				//template
				const template_elt = doc.querySelector( 'template' )
				if( template_elt && template_elt.innerHTML.trim() ){
					//如果获取的到Vue
					if( globalVue() ){
						component_data.render = globalVue().compile( template_elt.innerHTML )
					}
					else{
						component_data.template = template_elt.innerHTML
					}
				}

				//style
				const style_elt = doc.querySelector( 'style' )
				if( style_elt && style_elt.textContent.trim() ){
					if( !style_elt.id ){
						style_elt.id = "async_" + componentName + "_style"
						if( !document.querySelector("style#" + style_elt.id) ){
							document.head.append( style_elt )
						}
					}
				}
				await script_promise

				return component_data
			}

			const result = {
				name: componentName,
				loader: componentLoader,
				component: null,
				getComponent(){
					if( !this.component ){
						validateGlobalVue()
						this.component = globalVue().defineAsyncComponent(this.loader)
					}
					return this.component
				},
			}

			loadedResult.set( uri , result )
			return result
		}
		setConfig( options ){
			LoadConfig.setValues( globalConfig , options )
		}
		comp(){
			const component = _this.load.apply( _this , arguments ).getComponent()
			component.__asyncLoader()
			return component
		}
		delyComp(){
			return _this.load.apply( _this , arguments ).getComponent()
		}
		comps( configs ){
			const ret = {}
			configs.forEach( configIt =>{
				let path , options = {}
				const typeof_ = typeof configIt
				if( Array.isArray( configIt )){
					path = configIt[0]
					options.alias = configIt[1]
				}
				else if( typeof_ == "object" ){
					path = configIt.path
					options = configIt
				}
				else if( typeof_ == "string" ){
					path = configIt
				}
				const loaderResult = _this.load( path , options )
				const component = loaderResult.getComponent()
				component.__asyncLoader()
				ret[ loaderResult.name ] = component
			})
			return ret
		}
		compsPlugin( configs ){
			return {
				install( app ){
					const comps = _this.comps.call( _this , configs )
					Object.keys( comps )
					.forEach( name => app.component( name , comps[ name ] ) )
				}
			}
		}
	}
	const _this = vueSfcLoader
})();
