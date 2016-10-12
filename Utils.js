"use strict";

/**
 * JSONRPC namespace.
 * @namespace
 */
var JSONRPC=JSONRPC || {};

/**
 * Utils class.
 * @class
 */
JSONRPC.Utils=class
{
	/**
	 * @static
	 * @param {String} strJSON
	 * @returns {String}
	 */
	static JSONFormat(strJSON)
	{
		let strTabCharacter="  ";
		let strNewJSON="";
		let nIndentLevel=0;
		let bInString=false;

		let nLength=strJSON.length;

		for(let nCharacterPosition=0; nCharacterPosition<nLength; nCharacterPosition++)
		{
			let strCharacter=strJSON[nCharacterPosition];
			switch(strCharacter)
			{
				case "{":
				case "[":
					if(!bInString)
					{
						nIndentLevel++;
						strNewJSON+=strCharacter+"\r\n"+strTabCharacter.repeat(nIndentLevel);
					}
					else
						strNewJSON+=strCharacter;
					break;
				case "}":
				case "]":
					if(!bInString)
					{
						nIndentLevel--;
						strNewJSON+="\r\n"+strTabCharacter.repeat(nIndentLevel)+strCharacter;
					}
					else
						strNewJSON+=strCharacter;
					break;
				case ",":
					if(!bInString)
						strNewJSON+=",\r\n"+strTabCharacter.repeat(nIndentLevel);
					else
						strNewJSON+=strCharacter;
					break;
				case ":":
					if(!bInString)
						strNewJSON+=": ";
					else
						strNewJSON+=strCharacter;
					break;
				case "\"":
					if(nCharacterPosition > 0 && strJSON[nCharacterPosition-1] != "\\")
						bInString=!bInString;
				default:
					strNewJSON+=strCharacter;
					break;
			}
		}

		if(strNewJSON=="[\r\n  \r\n]")
			strNewJSON="[]";

		return strNewJSON;
	}
};