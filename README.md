# vue-sfc-loader
作用于无构建打包环境下，加载vue sfc  

灵感来源于这位大佬的 [FranckFreiburger/http-vue-loader](https://github.com/FranckFreiburger/http-vue-loader) 项目，感谢大佬[FranckFreiburger](https://github.com/FranckFreiburger)  

前置环境  
es2020，非module模式  
Vue3 编译版本 (compiler and runtime)  
Vue2 还没测试过,理论可以  


## 全局变量 `vueSfcLoader` 提供两个方法  

**vueSfcLoader.load(`path` :string，`options={}` :object):object**  
`path`的例子  
完整的url: http://example.com/first/sfc.vue  
不完整的url: first/sfc.vue  
只有文件名: sfc.vue  
甚至没有后缀,会自动补齐: sfc  

`options`是可选参数，以下是默认的
```javascript
{
	//预加载组件
	preload : true,
  	//组件请求用的
  	baseUrl : '',
  	//组件的别名，等同于重命名
  	alias : '',
  	vue : null,
}
```
**vueSfcLoader.setConfig(`options` :object)**  
覆盖全局配置
## 例
```html
<!-- sfc.vue -->
<style></style>
<template></template>
<!-- 异步脚本不会阻塞主脚本加载进页面 -->
<script src='other1.js' async></script>
<!-- 主脚本会等同步脚本加载完 -->
<script src='other2.js'></script>
<!-- 主脚本，只能有一个 -->
<script>
//仿造cjs方式
module.exports = {
  // 组件选项
}
//其他还有 baseUrl 可以在这里直接用
//有需要传入其他变量的可以在库里自行魔改

console.log( baseUrl )
</script>
```
```javascript
//index.js
const { createApp } = Vue
const app = createApp({
components : {
        MyComponent : vueSfcLoader.load(url)
    },
})
app.component(
	// 注册的名字
	'MyComponent',
	// 组件的实现
	vueSfcLoader.load(url)
)
```

## 其他
style的scoped没实现，因为觉得不实用  
现在只想到这么多，其他有想到再补充
