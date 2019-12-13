const path = require("path");
const fs = require("fs");
const webpack = require("webpack");
const recursiveKeys = require("recursive-keys");

const objPackageJSON = JSON.parse(fs.readFileSync("package.json"));

module.exports = [
	{
		target: "web", 
		externals: {
			"electron": "null",
			"fs": "null",
			"ws": "WebSocket", 
			"uws": "WebSocket", 
			"node-fetch": "fetch",
			"cluster": "null",
			"fs-promise": "null",
			"fs-extra": "null",
			"node-forge": "forge",
			"typescript-parser": "",
			"worker_threads": "null",
			"http": "null",
			"https": "null"
		}, 
		entry: [
			// "babel-polyfill",
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
			new webpack.optimize.OccurrenceOrderPlugin(),
			new webpack.optimize.DedupePlugin(),
			new webpack.DefinePlugin({
				"process.env": {
					"NODE_ENV": JSON.stringify("production")
				}
			}),
			new webpack.optimize.UglifyJsPlugin({
				minimize: true,
				sourceMap: true,
				compress: {
					screw_ie8: true,
					unused: true, 
					dead_code: true
				},
				mangle: {
					screw_ie8: true,
					except: recursiveKeys.dumpKeysRecursively(require("./index_webpack")).map(
						(strClassName) => {
							return strClassName.split(".").pop();
						}
					)
				},
				output: { 
					screw_ie8: true, 
					comments: false,
					preamble: `/**
						${objPackageJSON.name} v${objPackageJSON.version}
						${objPackageJSON.description}
						${objPackageJSON.homepage}
						\n\n${fs.readFileSync("./LICENSE")}
					*/`.replace(/\t+/g, "")
				}
			})
		]
	},
	{
		target: "web", 
		externals: {
			"electron": "null",
			"fs": "null",
			"ws": "WebSocket",
			"uws": "WebSocket",
			"node-fetch": "fetch",
			"cluster": "",
			"fs-promise": "",
			"fs-extra": "",
			"node-forge": "forge",
			"typescript-parser": "",
			"worker_threads": "null",
			"http": "null",
			"https": "null"
		}, 
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
	}
];

