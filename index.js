const obj={};
obj.JSONRPC={};

obj.JSONRPC.Client=require("./src/Client");
obj.JSONRPC.ClientPluginBase=require("./src/ClientPluginBase");
obj.JSONRPC.Exception=require("./src/Exception");
obj.JSONRPC.Utils=require("./src/Utils.js");

obj.JSONRPC.Filter=obj.JSONRPC.Filter || {};
obj.JSONRPC.Filter.Client=require("./src/Plugins/Client/index");

module.exports=obj;