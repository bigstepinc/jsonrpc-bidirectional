const path = require("path");
const webpack = require("webpack");

module.exports = {
	entry: [
		"babel-polyfill",
		"./index.js"
	],
	output: {
		path: path.join(__dirname, "browser"),
		filename: "bundle.js",
		libraryTarget: "commonjs2"
	},
	devtool: "source-map",
	target: "node",
	module: {
		loaders: [
			{
				test: /\.js$/,
				include: path.join(__dirname, "src"),
				loader: "babel-loader",
				query: {
					presets: ["es2015", "stage-0"]
				}
			}
		]
	}
};
