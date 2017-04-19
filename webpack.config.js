const path = require("path");
const webpack = require("webpack");

module.exports = {
	entry: [
		"babel-polyfill",
		"./index_webpack"
	],
	output: {
		path: path.join(__dirname, "builds", "browser", "es5"),
		filename: "jsonrpc.js",
		libraryTarget: "umd"
	},
	devtool: "source-map",
	module: {
		loaders: [
			{
				test: /\.js$/,
				include: [
					path.resolve(__dirname, "src")
				],
				exclude: [
					path.resolve(__dirname, "node_modules"),
					path.resolve(__dirname, "tests")
				],
				loader: "babel-loader",
				options: {
					presets: ["es2015", "stage-3"],
					plugins: ["async-to-promises"]
				}
			}
		]
	},
	plugins: [
		new webpack.optimize.UglifyJsPlugin({
			minimize: true,
			sourceMap: true
		})
	]
};
//test