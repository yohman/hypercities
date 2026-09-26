const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const duration = f => f.durationLabel.includes('hour') ? f.durationLabel : Math.floor(f.duration/60)+':'+String(f.duration%60).padStart(2,'0');
let playerApi;
function loadPlayerApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (playerApi) return playerApi;
  playerApi = new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    const fail=()=>{clearTimeout(timeout);script.remove();playerApi=null;reject(new Error('Player diagnostics unavailable'));};
    const timeout=setTimeout(fail,15000);
    const previous=window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady=()=>{clearTimeout(timeout);previous?.();resolve(window.YT);};
    script.src='https://www.youtube.com/iframe_api';
    script.onerror=fail;
    document.head.append(script);
  });
  return playerApi;
}

export class Origins {
  constructor() {
    this.dialog=document.querySelector('#origins-window');
    this.content=this.dialog.querySelector('[data-origins-content]');
    this.films=[];
    this.visited=new Set();
    this.filters={query:'',place:'',topic:'',time:''};
    this.dialog.addEventListener('click',e=>{
      const b=e.target.closest('button');
      if(b?.hasAttribute('data-origins-close')) this.dialog.close();
      else if(b?.dataset.film) this.select(b.dataset.film,true);
      else if(b?.hasAttribute('data-origins-play')) this.play();
      else if(b?.hasAttribute('data-origins-reset')) this.reset();
      else if(b?.dataset.step) this.step(Number(b.dataset.step));
      else if(b?.hasAttribute('data-origins-reload')) this.load();
      else if(e.target===this.dialog){
        const r=this.dialog.getBoundingClientRect();
        if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)this.dialog.close();
      }
    });
    this.dialog.addEventListener('input',e=>{
      const key=e.target.dataset.filter;
      if(key){this.filters[key]=e.target.value;this.renderResults();}
    });
    this.dialog.addEventListener('close',()=>{this.stop();this.content.replaceChildren();this.returnFocus?.focus({preventScroll:true});});
    this.dialog.addEventListener('keydown',e=>{
      e.stopPropagation();
      if(e.target.closest('input,select,textarea'))return;
      if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();this.step(e.key==='ArrowRight'?1:-1);}
    });
  }
  async open(returnFocus){this.returnFocus=returnFocus;this.dialog.showModal();await this.load();}
  async load(){
    this.content.innerHTML='<p role="status">Opening the archive…</p>';
    try{
      if(!this.films.length){
        const r=await fetch(new URL('../data/origins-videos.json',import.meta.url));
        if(!r.ok)throw new Error('Catalogue unavailable');
        this.films=(await r.json()).videos;
      }
      if(!this.dialog.open)return;
      this.shell();this.select(this.selected?.id||'1dgdlzlFeVI');
    }catch{
      if(this.dialog.open)this.content.innerHTML='<p>The catalogue could not load. <button data-origins-reload>Try again</button> or visit the archive link below. Local previews need an HTTP server, not file://.</p>';
    }
  }
  shell(){
    const options=values=>[...new Set(values.filter(Boolean))].sort().map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');
    this.content.innerHTML=`
      <section class="origins-browser" aria-label="Browse recordings">
        <details class="origins-browse" open><summary>Browse the archive <span>${this.films.length} recordings</span></summary>
          <label class="origins-search">Search the archive<input type="search" data-filter="query" placeholder="A place, person, or idea…" aria-label="Search recordings"></label>
          <div class="origins-filters">
            <label>Place<select data-filter="place"><option value="">All places</option>${options(this.films.map(f=>f.place))}<option value="unknown">Not yet located</option></select></label>
            <label>Topic<select data-filter="topic"><option value="">All topics</option>${options(this.films.flatMap(f=>f.topics))}</select></label>
            <label>Time<select data-filter="time"><option value="">All times</option><optgroup label="Time depicted"><option value="subject:2009">2009 · protests</option><option value="subject:Late antiquity">Late antiquity</option><option value="subject:Holocaust and remembrance">Holocaust &amp; remembrance</option></optgroup><optgroup label="Uploaded, not recorded"><option value="upload:2010">Uploaded 2010</option><option value="upload:2016">Uploaded 2016</option></optgroup></select></label>
          </div>
          <div class="origins-result-meta"><span data-result-count role="status"></span><button data-origins-reset>Reset</button></div>
          <nav class="origins-results" aria-label="Recordings" data-results></nav>
        </details>
      </section>
      <article class="origins-film" aria-labelledby="origins-question" data-film-detail></article>`;
    for(const [key,value]of Object.entries(this.filters))this.content.querySelector('[data-filter="'+key+'"]').value=value;
  }
  matches(){
    const {query,place,topic,time}=this.filters;
    const words=query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return this.films.filter(f=>{
      const text=[f.title,f.place,...f.topics,f.subjectPeriod,f.uploadedYear].join(' ').toLocaleLowerCase();
      return words.every(w=>text.includes(w))&&(!place||(place==='unknown'?!f.place:f.place===place))&&(!topic||f.topics.includes(topic))&&(!time||(time.startsWith('upload:')?f.uploadedYear===Number(time.slice(7)):f.subjectPeriod===time.slice(8)));
    });
  }
  reset(){this.filters={query:'',place:'',topic:'',time:''};this.content.querySelectorAll('[data-filter]').forEach(i=>{i.value='';});this.renderResults();}
  renderResults(){
    this.results=this.matches();
    this.content.querySelector('[data-result-count]').textContent=this.results.length+' of '+this.films.length+' recordings';
    this.content.querySelector('[data-results]').innerHTML=this.results.length?this.results.map(f=>`<button data-film="${f.id}" aria-current="${f.id===this.selected?.id}" class="${this.visited.has(f.id)?'is-visited':''}"><i aria-hidden="true"></i><span>${esc(f.title)}<small>${esc(f.place||f.topics[0])} · ${esc(duration(f))}</small></span></button>`).join(''):'<p>No recordings match. Try another place, topic, or time.</p>';
    const index=this.results.findIndex(f=>f.id===this.selected?.id);
    const position=this.content.querySelector('[data-position]');
    if(!position)return;
    position.textContent=index<0?'Selected film is outside these results':(index+1)+' / '+this.results.length;
    this.content.querySelector('[data-step="-1"]').disabled=index<=0;
    this.content.querySelector('[data-step="1"]').disabled=!this.results.length||index>=this.results.length-1;
  }
  step(direction){
    if(!this.results?.length)return;
    const next=this.results[this.results.findIndex(f=>f.id===this.selected?.id)+direction];
    if(next)this.select(next.id,true);
  }
  related(film){
    // Named editorial matches, not an invented fixed six-film sequence.
    const candidates=this.films.filter(f=>f.id!==film.id).map(f=>({film:f,place:!!film.place&&f.place===film.place,topic:f.topics.find(t=>film.topics.includes(t))}));
    const place=candidates.find(c=>c.place&&!this.visited.has(c.film.id))||candidates.find(c=>c.place);
    const topic=candidates.find(c=>c.topic&&!c.place&&!this.visited.has(c.film.id))||candidates.find(c=>c.topic&&c!==place&&!this.visited.has(c.film.id))||candidates.find(c=>c.topic&&c!==place);
    return [place,topic].filter(Boolean);
  }
  select(id,focus=false){
    const f=this.films.find(f=>f.id===id);if(!f)return;
    this.stop();this.selected=f;this.visited.add(id);
    this.content.querySelector('[data-film-detail]').innerHTML=`
      <p class="origins-location">${esc(f.place||f.topics[0])} <span>·</span> ${esc(duration(f))}</p>
      <h2 id="origins-question" tabindex="-1">${esc(f.title)}</h2>
      <div class="origins-screen"><button class="origins-play" data-origins-play aria-label="Play ${esc(f.title)}"><img src="https://i.ytimg.com/vi/${f.id}/hqdefault.jpg" alt="" width="480" height="360"><span class="origins-play-label"><i aria-hidden="true">▷</i> PLAY RECORDING</span></button></div>
      <p class="origins-playback-status" data-player-status role="status">${f.embedRestriction?'This recording is age-restricted by YouTube; it may require watching there.':''}</p>
      <div class="origins-player-links"><button data-origins-play>Reload player</button><a href="${f.source}" target="_blank" rel="noopener">Watch on YouTube ↗</a></div>
      ${f.description?'<p class="origins-note">'+esc(f.description)+'</p>':''}
      <p class="origins-provenance">Uploaded ${f.uploadedYear}${f.subjectPeriod?' · Subject: '+esc(f.subjectPeriod):''}. <span>Upload date is not the recording date.</span></p>
      <div class="origins-sequence"><button data-step="-1">← Previous video</button><span data-position></span><button data-step="1">Next video →</button></div>
      <section class="origins-related" aria-label="Related recordings"><p>Explore a connection</p>${this.related(f).map(c=>`<button data-film="${c.film.id}"><small>${esc(c.place?'Same place · '+f.place:'Shared topic · '+c.topic)}</small><span>${esc(c.film.title)} →</span></button>`).join('')||'<span>Choose another recording from the archive.</span>'}</section>`;
    this.renderResults();
    if(focus){
      if(matchMedia('(max-width:780px)').matches)this.content.querySelector('.origins-browse').open=false;
      this.content.querySelector('h2').focus({preventScroll:true});
      this.dialog.scrollTop=0;
    }
  }
  stop(){
    this.playRequest=null;clearTimeout(this.playerTimeout);
    this.player?.destroy();this.player=null;
    this.content.querySelector('iframe')?.remove();
  }
  async play(){
    this.stop();const request={};this.playRequest=request;
    const film=this.selected,screen=this.content.querySelector('.origins-screen'),status=this.content.querySelector('[data-player-status]');
    status.textContent='';
    // Complete standard embed first; optional API diagnostics never gate playback.
    // Set referrer policy BEFORE navigating, rather than after the API inserts it.
    const frame=document.createElement('iframe');
    frame.title=film.title;frame.referrerPolicy='strict-origin-when-cross-origin';
    frame.allow='autoplay; encrypted-media; fullscreen; picture-in-picture';frame.allowFullscreen=true;
    const params=new URLSearchParams({playsinline:'1',rel:'0',enablejsapi:'1'});
    if(/^https?:$/.test(location.protocol))params.set('origin',location.origin);
    frame.src='https://www.youtube-nocookie.com/embed/'+film.id+'?'+params;
    screen.replaceChildren(frame);
    this.playerTimeout=setTimeout(()=>{if(this.playRequest===request)status.textContent='If the player stays blank, reload it or watch on YouTube. Some browsers restrict embedded playback.';},15000);
    try{
      const api=await loadPlayerApi();
      if(this.playRequest!==request||!this.dialog.open)return;
      this.player=new api.Player(frame,{events:{
        onReady:()=>{if(this.playRequest===request){clearTimeout(this.playerTimeout);status.textContent='';}},
        onStateChange:e=>{if(this.playRequest===request&&e.data===1){clearTimeout(this.playerTimeout);status.textContent='';}},
        onError:e=>{
          if(this.playRequest!==request)return;clearTimeout(this.playerTimeout);
          const reasons={2:'Invalid video address.',5:'YouTube could not play this video in this browser.',100:'This recording is unavailable on YouTube.',101:'The owner does not allow this recording to be embedded.',150:'The owner does not allow this recording to be embedded.',153:'YouTube could not verify this preview’s referring site. Try the published site or watch on YouTube.'};
          status.textContent=(reasons[e.data]||'YouTube could not play this recording here.')+' (YouTube '+e.data+')';
        }
      }});
    }catch{/* The ordinary iframe remains available without the API. */}
  }
}
