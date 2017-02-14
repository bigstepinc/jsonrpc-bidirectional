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
		libraryTarget: "umd"
	},
	devtool: "source-map",
	module: {
		loaders: [
			{
				test: /\.js$/,
				include: [
					path.resolve(__dirname, "src"),
					// path.resolve(__dirname, "tests")
				],
				loader: "babel-loader",
				query: {
					presets: ["es2015", "stage-0"]
				}
			}
		]
	}
};
