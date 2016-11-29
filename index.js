const obj={};
obj.JSONRPC={};

obj.JSONRPC.Client=require("./src/Client");
obj.JSONRPC.ClientFilterBase=require("./src/ClientFilterBase");
obj.JSONRPC.Exception=require("./src/Exception");
obj.JSONRPC.Utils=require("./src/Utils.js");

obj.JSONRPC.Filter=obj.JSONRPC.Filter || {};
obj.JSONRPC.Filter.Client=require("./src/filters/client/index");

module.exports=obj;