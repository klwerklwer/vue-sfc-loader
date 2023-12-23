(()=>{
	//加载配置
	class LoadConfig{
		/**
		 * 
		 * @param {object} values 
		 */
		constructor( values = {} ){
			//预加载
			this.preload = true
			this.baseUrl = ''
			//组件别名 重命名
			this.alias = ''
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
			//完整资源路径
			const uri = baseUrl + url + urn + query_params
			const component_name = load_config.alias || urn.substring( 0 , urn.length - 4 )
	
			/**
			 * 加载器
			 * @returns {Promise}
			 */
			let loader = async function (){
				const file_promise = await fetch( uri )
				if( !file_promise.ok ){
					throw Object.assign( new Error( file_promise.statusText + ' ' + uri), { file_promise } )
				}
	
				const file_content = await file_promise.text()
				const component_data = {}
	
				//创建document
				const doc = document.implementation.createHTMLDocument('')
				doc.body.innerHTML = file_content

				/**
				 * 处理脚本
				 * 额外添加vue3没有的sfc解析功能,
				 * 含有src属性的脚本会被动态加入到页面上,这样的脚本可以有多个,且async属性是false的脚本视为同步,
				 * exports的脚本会在同步后执行
				 */
				const script_elts = doc.body.querySelectorAll( 'script' )
				let script_promise = Promise.resolve()
				if( script_elts.length ){
					script_promise = (async()=>{
						//同步,src脚本promise
						const script_load_promises = []
						let main_script
						for( let elt of script_elts ){
							if( elt.src ){
								/**
								 * 直接使用源elt插入时,src不请求,不知道原因
								 * cloneNode(true) 得到的elt 也是同样的问题, 不得已只能创建elt赋值属性
								 */
								const clone_elt = document.createElement( 'script' )
								clone_elt.async = elt.async
								clone_elt.defer = elt.defer
								clone_elt.src = elt.src
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
							Object.assign( component_data , module.exports )
						}
					})();
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
					document.head.append( style_elt )
					if( !style_elt.id ){
						style_elt.id = "async_" + component_name + "_style"
					}
				}
				await script_promise

				return component_data
			}

			let return_ = {
				name : component_name ,
			}
			if( load_config.preload ){
				loader = loader()
				return_.loader = ()=> loader
			}
			else{
				return_.loader = loader
			}
			return return_
		}
		setConfig( options ){
			LoadConfig.setValues( globalConfig , options )
		}
		loaders( path_array , options = {}){
			const ret = []
			for( let item of path_array ){
				let path , alias = ''
				if( Array.isArray( item ) ){
					[ path , alias = '' ] = item
				}
				else{
					path = item
				}
				const clone_load_config = globalConfig.clone( { ...options , alias })
				ret.push( this.load( path , clone_load_config ) )
			}
			return ret
		}
		compsObject(){
			if( !globalVue() ){
				throw new Error( "缺少vue" )
			}
			return this.loaders.apply( this , arguments ).reduce( ( ret , item ) =>{
				ret[ item.name ] = globalVue().defineAsyncComponent( item )
				return ret
			} ,{})
		}
		compsPlugin(){
			if( !globalVue() ){
				throw new Error( "缺少vue" )
			}
			const loaders = this.loaders.apply( this , arguments )
			return {
				install( app ){
					loaders.forEach( item => app.component( item.name , globalVue().defineAsyncComponent( item ) ) )
				}
			}
		}
	}
})()