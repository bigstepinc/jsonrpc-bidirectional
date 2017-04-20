const path = require("path");
const fs = require("fs");
const webpack = require("webpack");

const objPackageJSON = JSON.parse(fs.readFileSync("package.json"));

module.exports = [
	{
		target: "web", 
		externals: {
			// Map require("something) to global variable Something.
			// "something": "Something"
			//"node-fetch": "fetch",
			//"es6-promise": "Promise"
		}, 
		entry: [
			"babel-polyfill",
			"./index_webpack"
		],
		output: {
			path: path.join(__dirname, "builds", "browser", "es5"),
			filename: "jsonrpc.min.js",
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
						plugins: [
							"async-to-promises", 
							"remove-comments"
						],
						babelrc: false
					}
				}
			]
		},
		plugins: [
			new webpack.optimize.UglifyJsPlugin({
				minimize: true,
				sourceMap: true,
				compress: { screw_ie8: true },
				mangle: { screw_ie8: true },
				output: { 
					screw_ie8: true, 
					comments: false,
					preamble: `/**
						${objPackageJSON.name} v${objPackageJSON.version}
						${objPackageJSON.description}
						${objPackageJSON.homepage}
						${objPackageJSON.homepage}/blob/master/LICENSE
					*/`.replace(/\t+/g, "\t")
				}
			})
		]
	}/*,
	{
		target: "web", 
		entry: [
			"./index_webpack"
		],
		output: {
			path: path.join(__dirname, "builds", "browser", "es7"),
			filename: "jsonrpc.min.js",
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
						path.resolve(__dirname, "node_modules") + "/",
						path.resolve(__dirname, "tests")
					],
					loader: "babel-loader",
					options: {
						plugins: ["remove-comments"],
						babelrc: false
					}
				}
			]
		},
		plugins: [
		]
	}*/
];

