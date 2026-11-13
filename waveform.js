/* Three joined yellow ribbons. Both edges grow from the same horizon. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LeteoWaves=api;
})(typeof window!=='undefined'?window:null,function(){
  const width=360,horizon=52,steps=36;
  const clamp=value=>Math.max(0,Math.min(1,Number(value)||0));
  const round=value=>Math.round(value*10)/10;
  const point=([x,y])=>x+' '+y;
  function smooth(points,begin){
    let d=begin?'M'+point(points[0]):'';
    for(let i=1;i<points.length-1;i++){
      const a=points[i],b=points[i+1];
      d+=' Q'+point(a)+' '+point([round((a[0]+b[0])/2),round((a[1]+b[1])/2)]);
    }
    return d+' Q'+point(points.at(-1))+' '+point(points.at(-1));
  }

  function paths(level=0,time=0){
    const volume=clamp(level),shapes=[];
    for(let layer=0;layer<3;layer++){
      const upper=[],lower=[],phase=[.2,1.7,3.5][layer],strength=[1,.76,.58][layer];
      for(let step=0;step<=steps;step++){
        const x=width*step/steps,u=step/steps;
        const edge=Math.pow(Math.sin(Math.PI*u),.95);
        const drift=time*(.85+layer*.15);
        const crest=.5+.5*Math.sin(u*Math.PI*(3.2+layer*.55)-drift+phase);
        const trough=.5+.5*Math.sin(u*Math.PI*(4.1-layer*.35)+drift*.82+phase+1.9);
        const rise=edge*strength*(3.3+volume*(17+17*crest));
        const fall=edge*strength*(3+volume*(15+18*trough));
        upper.push([round(x),round(horizon-rise)]);
        lower.push([round(x),round(horizon+fall)]);
      }
      shapes.push(smooth(upper,true)+smooth(lower.reverse(),false)+' Z');
    }
    return shapes;
  }

  function create(svg){
    if(!svg)return {setActive(){},setLevel(){}};
    const ribbons=[...svg.querySelectorAll('path')];
    const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    let active=false,target=0,level=0,time=0,frame=0,last=0;
    function render(){paths(level,time).forEach((path,index)=>ribbons[index]?.setAttribute('d',path));}
    function tick(now){
      if(!active)return;
      const elapsed=Math.min(50,Math.max(0,now-last||16));last=now;
      level+=(target-level)*Math.min(1,elapsed/110);
      time+=elapsed/1000*(.35+level*2.1);
      render();
      frame=requestAnimationFrame(tick);
    }
    render();
    return {
      setActive(on){
        if(active===!!on)return;
        active=!!on;
        if(active&&!reduced){last=0;frame=requestAnimationFrame(tick);}
        else {cancelAnimationFrame(frame);frame=0;target=0;level=0;time=0;render();}
      },
      setLevel(raw){
        // Ignore the recognizer's quiet room floor, then use its 0..1 meter.
        target=clamp((clamp(raw)-.12)/.88);
        if(reduced&&active){level=target;render();}
      }
    };
  }
  return {paths,create};
});
