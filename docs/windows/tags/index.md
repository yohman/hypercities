---
hide:
  - navigation
---

<h1 id="title">Work Tags</h1>

<!-- two buttons to toggle between gallery view and tag view -->
<span class="btn btn-off" tabindex="0" alt="gallery view" title="gallery view" onclick="window.location.href = '../'" onkeydown="if(event.keyCode === 13) { window.location.href = '../' }">
	gallery view
</span>
<span class="btn btn-on" tabindex="0" alt="tab view" title="tab view">
	tag view
</span>

<div class="tag-gallery"></div> 

<script>

// --------------------------------	//
//                            		//
//	  Gamefied version		    	//
//                            		//
// -------------------------------- //
var urlParams = new URLSearchParams(window.location.search);
if(urlParams.has('gamified')) {
	alert("Congratulations! You have chosen the gamified version! This is still under (secret) development, so stay tuned!");
}

// --------------------------------	//
//                            		//
//	  Initialize			    	//
//                            		//
// -------------------------------- //

let section = 'work'
let tags = [];

function init(){

	data.work.forEach(function(row) {
		let tagList = row[6].split(',');
		tagList.forEach(function(tag) {
			tags.push(tag.trim());
		});
	});
	// --------------------------------	//
	// Loop through project data		//
	// -------------------------------- //
	counter = 0;


	// --------------------------------	//
	// Add tags							//
	// -------------------------------- //
	// add count to tags


	 

	distinct_tags = tags.filter(function(item, i, ar){ return ar.indexOf(item) === i; });

	// sort tags ignore case
	distinct_tags.sort(function(a, b) {
		return a.toLowerCase().localeCompare(b.toLowerCase());
	});

	console.log(distinct_tags);

	distinct_tags.forEach(function(tag) {
		createTagDiv(tag);

	});

	
}


</script>