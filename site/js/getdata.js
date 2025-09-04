// -------------------------------------------- //
// Parameters to be used in the page            //
// -------------------------------------------- //
console.log('Getting data...');

// may not need this, as we are fetching data from a json file
// instead, use the getdata.py script to get the data from the Google Sheet
const spreadsheetId = '1GCRfWTsWSynXYQTE970dg422pvhIV67MInIy6Gb-pSQ';
const apiKey = 'AIzaSyAxlHpEwRMRcj5qobzddd2oN9FNjWAh0RY';

// sections of the data
const sheetNames = ['windows'];

let data = {};

// Determine the environment
let environment;
if (window.location.href.includes('github') && window.location.href.includes('site')) {
    environment = 'git';
} else if (window.location.href.includes('site')) {
    environment = 'postbuild';
} else {
    environment = 'prebuild';
}

// Set the base URL to a fixed location
// let baseUrl = 'http://127.0.0.1:8000/';

// console.log('Base URL:', baseUrl);

// -------------------------------------------- //
// Fetch data from the json file                //
// -------------------------------------------- //
// Determine the relative path to sheets_data.json based on the current script location
const scriptPath = document.currentScript.src;
const basePath = scriptPath.substring(0, scriptPath.lastIndexOf('/'));
const jsonPath = `${basePath}/sheets_data.json`;

console.log('JSON Path:', jsonPath);

// Fetch the JSON data
fetch(jsonPath)
	.then(response => {
		console.log('Fetching data from:', response.url);
		if (!response.ok) {
			throw new Error(`HTTP error! Status: ${response.status}`);
		}
		return response.text();
	})
	.then(text => {
		try {
			// More thorough comment removal (handles both line and block comments)
			let cleanedText = text.replace(/\/\*[\s\S]*?\*\//g, '');
			let inString = false;
			let quoteChar = '';
			let result = '';
			
			for (let i = 0; i < cleanedText.length; i++) {
				const char = cleanedText[i];
				const nextChar = cleanedText[i + 1] || '';
				
				if ((char === '"' || char === "'") && (i === 0 || cleanedText[i - 1] !== '\\')) {
					if (!inString) {
						inString = true;
						quoteChar = char;
					} else if (char === quoteChar) {
						inString = false;
					}
				}
				
				if (!inString && char === '/' && nextChar === '/') {
					while (i < cleanedText.length && cleanedText[i] !== '\n') {
						i++;
					}
					continue;
				}
				
				result += char;
			}
			
			console.log('Attempting to parse JSON...');
			return JSON.parse(result);
		} catch (e) {
			console.error('JSON parsing error:', e);
			console.log('Problematic JSON text (first 500 chars):', text.substring(0, 500));
			
			try {
				const simpleClean = text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
				return JSON.parse(simpleClean);
			} catch (fallbackError) {
				console.error('Fallback parsing also failed:', fallbackError);
				throw new Error('Failed to parse JSON data. See console for details.');
			}
		}
	})
	.then(gdata => {
		sheetNames.forEach(sheetName => {
			const allEntries = gdata[sheetName];
			
			if (allEntries && allEntries.length > 0) {
				const headers = allEntries[0];
				let showColumnIndex = -1;
				if (headers) {
					showColumnIndex = headers.findIndex(header => 
						header && String(header).toLowerCase().includes('show'));
				}
				
				let filteredEntries;
				if (showColumnIndex !== -1) {
					filteredEntries = allEntries.slice(1).filter(row => {
						if (!row || row.length <= showColumnIndex) return true;
						return !(row[showColumnIndex] === "FALSE" || row[showColumnIndex] === false);
					});
				} else {
					filteredEntries = allEntries.slice(1);
					console.warn(`No 'show' column found in ${sheetName}. All entries will be included.`);
				}
				
				data[sheetName] = filteredEntries;
				data[sheetName].values = filteredEntries;
				data[sheetName].headers = headers;
			} else {
				data[sheetName] = [];
				data[sheetName].values = [];
				data[sheetName].headers = [];
			}
		});
		
		console.log('Successfully processed data:', data);
		setTimeout(() => {
			document.dispatchEvent(new Event('dataLoaded'));
		}, 50);
		if (typeof init === 'function') {
			init();
		} else {
			console.warn('No init function found to call after data loading');
		}
	})
	.catch(error => {
		console.error('Error fetching or processing data:', error);
		const errorMsg = document.createElement('div');
		errorMsg.style.cssText = 'position:fixed;top:10px;left:10px;background:red;color:white;padding:10px;z-index:9999;';
		errorMsg.textContent = `Error loading data: ${error.message}`;
		document.body.appendChild(errorMsg);
	});


	var urlParams = new URLSearchParams(window.location.search);


// -------------------------------------------- //
// Add gallery item								//
// -------------------------------------------- //
function addGalleryItem(row,counter,selector) {
	// create a container for the gallery item and gallery tags
	let galleryContainer = document.createElement('div');
	galleryContainer.className = 'gallery-container';
	
	// gallery item
	let galleryItem = document.createElement('div');
	galleryItem.className = 'gallery-item';
	
	// link
	let link = document.createElement('a');
	// sometimes, link name is different from the section name...
	if (section == 'consult') {
		link.href = 'who/?id='+counter;
	} else if (section == 'learn') {
		link.href = 'workshop/?id='+counter;
	} else if (section == 'musings') {
		link.href = 'posts/?id='+counter;
	} else {
		link.href = 'project/?id='+counter;
	}

	// image
	// if image is not available, use the default image
	// if row[4] is undefined, use the default image
	if (row[4] == undefined || row[4] == '') {
		image_file = 'sandbox.png';
	} else {
		image_file = row[4];
	}
	let img = document.createElement('img');
	img.src = '../'+section+'/images/'+image_file; 
	img.alt = row[1]; 
	// if section is consult, don't add section to the path
	if (section == 'consult') {
		img.src = '../images/'+image_file;
	}

	// caption
	let caption = document.createElement('div');
	caption.className = 'caption';
	caption.innerHTML = row[0]+'<br>'+row[1]; 

	// hover effect
	img.style.filter = "grayscale(100%)";
	img.onmouseover = function() {
		img.style.filter = "grayscale(0%)";
	}
	img.onmouseout = function() {
		img.style.filter = "grayscale(100%)";
	}
	caption.onmouseover = function() {
		img.style.filter = "grayscale(0%)";
	}
	caption.onmouseout = function() {
		img.style.filter = "grayscale(100%)";
	}

	// append elements
	link.appendChild(img);
	link.appendChild(caption);
	// add alt tags
	img.alt = row[0] + ' - ' + row[1];
	img.title = row[0] + ' - ' + row[1];
	galleryItem.appendChild(link);
	// append elements
	galleryContainer.appendChild(galleryItem);
	// append elements

	// --------------------------------	//
	// tags								//
	// -------------------------------- //
	let tags = row[6];
	if (tags) {
		let tagList = tags.split(','); // Split the tags by comma
		let tagContainer = document.createElement('div');
		tagContainer.className = 'tag-container';
		tagList.forEach(function(tag) {
			let tagItem = document.createElement('span');
			tagItem.className = 'tag';
			tagItem.textContent = tag.trim();
			// get rid of the leading and trailing white spaces
			tag = tag.trim();
			tagItem.onclick = function() {
				window.location.search = '?tag='+tag;
			}
			// add title attribute
			tagItem.title = tag;
			// set cursor to pointer
			tagItem.style.cursor = "pointer";
			tagContainer.appendChild(tagItem);
		});
		// galleryItem.appendChild(tagContainer);
		galleryContainer.appendChild(tagContainer);
	}

	// if selector argument is provided, append to the selector, otherwise, append to the gallery
	if (selector) {
		document.querySelector(selector).appendChild(galleryContainer);
	} else {
		document.querySelector('.gallery').appendChild(galleryContainer);
	}
}

// -------------------------------------------- //
// Create tag divs				            	//
// -------------------------------------------- //
function createTagDiv(tag) {
	let tagItem = document.createElement('div');
	tagItem.className = 'tag-round';
	// add the tag name plus the count
	tag_count = tags.filter(function(x) { return x === tag }).length;
	// if tag count is 1, make the width and height 50px, for every additional tag, multiply by 1.5
	tagItem.style.width = 80 + (tag_count-1)*40 + 'px';
	tagItem.style.height = 80 + (tag_count-1)*40 + 'px';
	// if tag count is 1, make the font size 6px, for every additional tag, multiply by 1.5
	tagItem.style.fontSize = 10 + (tag_count-1)*4 + 'px';
	if (tag_count > 1) {
		tagItem.textContent = tag + ' (' + tag_count + ')';
	} else {
		tagItem.textContent = tag;
	}
	// tagItem.textContent = tag;
	tagItem.onclick = function() {
		// get the current url, and go to the work page (one folder up) with the tag parameter
		currentUrl = window.location.href;
		// find the work page
		workIndex = currentUrl.indexOf('/'+section+'/');
		// use substring to get the url of the work page and add the tag parameter
		window.location.href = currentUrl.substring(0, workIndex+section.length+2) + '?tag='+tag;
	}
	// set cursor to pointer
	tagItem.style.cursor = "pointer";
	// add title attribute
	tagItem.title = tag;
	// add alt tag
	tagItem.alt = tag;
	// add tabindex
	tagItem.tabIndex = 0;
	// add onkeypress event
	tagItem.onkeypress = function(event) {
		if (event.key === 'Enter') {
			tagItem.click();
		}
	}
	document.querySelector('.tag-gallery').appendChild(tagItem);
}

// -------------------------------------------- //
// Get URL parameters				            //
// -------------------------------------------- //
function getUrlParams() {
	var params = {};
	var queryString = window.location.search;
	var urlParams = new URLSearchParams(queryString);
	urlParams.forEach(function(value, key) {
		params[key] = value;
	});
	return params;
}
