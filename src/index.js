require("babel-core/register");
require("babel-polyfill");

const obj={};
obj.JSONRPC={};

obj.JSONRPC.Client=require("./Client");
obj.JSONRPC.ClientFilterBase=require("./ClientFilterBase");
obj.JSONRPC.Exception=require("./Exception");
obj.JSONRPC.Utils=require("./Utils.js");

obj.JSONRPC.Filter=obj.JSONRPC.Filter || {};
obj.JSONRPC.Filter.Client=require("./filters/client/index");

module.exports=obj;