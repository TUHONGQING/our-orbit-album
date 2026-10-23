// Native-resolution depth-projected particles, up to 3840 x 2160 backing pixels.
export function createGalaxy(canvas) {
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const options={alpha:false,antialias:false,depth:false,stencil:false,powerPreference:'low-power'};
  let gl;
  try { gl=canvas.getContext('webgl',options); } catch { gl=null; }
  let context=gl?null:canvas.getContext('2d',{alpha:false});
  if(!gl&&!context)return {setAppearance(){},setActive(){}};
  let program,buffer,uniforms,points=new Float32Array(),count=0;
  let width=0,height=0,dpr=1,frame=0,last=0,time=0;
  let active=false,motion=true,glow=.75,color=[.933,.608,.847];
  let offsetX=0,offsetY=0,targetX=0,targetY=0,lost=false;
  let seed=51723;
  function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}

  const vertexSource=`
    precision highp float;
    attribute vec3 aPosition;
    attribute vec4 aStyle;
    uniform float uTime;
    uniform float uAspect;
    uniform float uDpr;
    uniform vec2 uPointer;
    varying mediump float vAlpha;
    varying mediump float vTint;
    varying mediump float vSparkle;
    void main(){
      float depth=0.65+fract(aPosition.z-uTime*0.011)*3.8;
      vec2 projected=aPosition.xy/depth;
      projected.x/=uAspect;
      projected+=uPointer/(depth+0.5);
      gl_Position=vec4(projected,0.0,1.0);
      gl_PointSize=clamp(aStyle.x*(0.55+1.1/depth)*uDpr,0.8*uDpr,4.3*uDpr);
      float flicker=0.88+0.12*sin(uTime*0.75+aStyle.y);
      vAlpha=clamp((0.16+0.76/(depth+0.3))*aStyle.w*flicker,0.08,0.95);
      vTint=aStyle.z;
      vSparkle=step(2.1,aStyle.x);
    }
  `;
  const fragmentSource=`
    precision mediump float;
    uniform vec3 uColor;
    uniform float uGlow;
    varying mediump float vAlpha;
    varying mediump float vTint;
    varying mediump float vSparkle;
    void main(){
      vec2 p=gl_PointCoord-0.5;
      float core=exp(-dot(p,p)*14.0);
      float halo=exp(-dot(p,p)*8.0)*0.12;
      float crossGlow=(exp(-abs(p.x)*45.0-abs(p.y)*6.0)+exp(-abs(p.y)*45.0-abs(p.x)*6.0))*0.12*vSparkle;
      float alpha=(core+halo+crossGlow)*vAlpha*(0.4+uGlow*1.1);
      vec3 white=vec3(0.94,0.95,1.0);
      vec3 starColor=mix(white,uColor,vTint*0.48);
      gl_FragColor=vec4(starColor,alpha);
    }
  `;
  function compile(type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){gl.deleteShader(shader);throw new Error('Star shader compilation failed');}return shader;}
  function setupGPU(){
    const vertex=compile(gl.VERTEX_SHADER,vertexSource),fragment=compile(gl.FRAGMENT_SHADER,fragmentSource);
    program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Star program linking failed');
    gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    const position=gl.getAttribLocation(program,'aPosition'),style=gl.getAttribLocation(program,'aStyle');
    gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,3,gl.FLOAT,false,28,0);
    gl.enableVertexAttribArray(style);gl.vertexAttribPointer(style,4,gl.FLOAT,false,28,12);
    uniforms=Object.fromEntries(['uTime','uAspect','uDpr','uPointer','uColor','uGlow'].map(name=>[name,gl.getUniformLocation(program,name)]));
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.disable(gl.DEPTH_TEST);
    canvas.dataset.renderer='webgl';
  }
  function fallback(){
    const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);canvas=replacement;gl=null;context=canvas.getContext('2d',{alpha:false});canvas.dataset.renderer='canvas2d';
  }
  if(gl){try{setupGPU();}catch{fallback();}}else canvas.dataset.renderer='canvas2d';

  function buildPoints(){
    seed=51723;
    count=Math.round(Math.min(gl?18000:3600,Math.max(2000,width*height/270)));
    points=new Float32Array(count*7);
    const aspect=width/height;
    for(let i=0;i<count;i++){
      const k=i*7;
      points[k]=(random()*2-1)*2.6*aspect;
      points[k+1]=(random()*2-1)*2.6;
      points[k+2]=random();
      points[k+3]=1.0+Math.pow(random(),2.4)*2;
      points[k+4]=random()*Math.PI*2;
      points[k+5]=random();
      points[k+6]=.65+random()*.35;
    }
    if(gl&&!lost){gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,points,gl.STATIC_DRAW);}
    canvas.dataset.particles=String(count);canvas.dataset.ready='true';
  }
  function draw(){
    if(lost)return;
    if(gl){
      gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(.001,.001,.004,1);gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);gl.uniform1f(uniforms.uTime,time);gl.uniform1f(uniforms.uAspect,width/height);gl.uniform1f(uniforms.uDpr,dpr);gl.uniform2f(uniforms.uPointer,offsetX,offsetY);gl.uniform3fv(uniforms.uColor,color);gl.uniform1f(uniforms.uGlow,glow);
      gl.drawArrays(gl.POINTS,0,count);
    }else if(context){
      context.setTransform(dpr,0,0,dpr,0,0);context.fillStyle='#010102';context.fillRect(0,0,width,height);
      for(let i=0;i<count;i++){
        const k=i*7,cycle=points[k+2]-time*.011,depth=.65+(cycle-Math.floor(cycle))*3.8;
        const x=(points[k]/depth/(width/height)+offsetX/(depth+.5)+1)*width*.5;
        const y=(1-points[k+1]/depth-offsetY/(depth+.5))*height*.5;
        if(x<0||x>width||y<0||y>height)continue;
        const r=Math.min(2.15,points[k+3]*(.55+1.1/depth)*.35);
        const alpha=Math.min(.95,(.16+.76/(depth+.3))*points[k+6])*(.88+.12*Math.sin(time*.75+points[k+4]))*(.4+glow*1.1);
        const tint=points[k+5]*.48,rgb=color.map((v,j)=>Math.round(([.94,.95,1][j]*(1-tint)+v*tint)*255));
        context.fillStyle='rgba('+rgb.join(',')+','+alpha+')';context.beginPath();context.arc(x,y,r,0,Math.PI*2);context.fill();
      }
    }
  }
  function shouldAnimate(){return active&&motion&&!reduced.matches&&!document.hidden&&!lost;}
  function tick(now){
    frame=0;if(!shouldAnimate())return;
    if(!last||now-last>=(gl?16:33)){
      const delta=last?Math.min(now-last,80):16;time+=delta/1000;
      offsetX+=(targetX-offsetX)*.06;offsetY+=(targetY-offsetY)*.06;
      draw();last=now;
    }
    frame=requestAnimationFrame(tick);
  }
  function schedule(){cancelAnimationFrame(frame);frame=0;last=0;if(active)draw();if(shouldAnimate())frame=requestAnimationFrame(tick);canvas.dataset.moving=String(shouldAnimate());}
  function resize(){
    width=Math.max(1,innerWidth);height=Math.max(1,innerHeight);
    dpr=Math.min(devicePixelRatio||1,3,Math.sqrt(3840*2160/(width*height)));
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    canvas.dataset.resolution=canvas.width+'x'+canvas.height;
    buildPoints();schedule();
  }
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;schedule();});
  canvas.addEventListener('webglcontextrestored',()=>{lost=false;try{setupGPU();resize();}catch{fallback();resize();}});
  let resizeTimer;
  window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(resize,100);});
  document.addEventListener('pointermove',event=>{if(event.pointerType==='touch'||reduced.matches)return;targetX=(event.clientX/width-.5)*.015;targetY=-(event.clientY/height-.5)*.015;},{passive:true});
  document.addEventListener('visibilitychange',schedule);reduced.addEventListener('change',schedule);
  window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);frame=0;});window.addEventListener('pageshow',schedule);
  resize();
  return {
    setActive(value){active=Boolean(value);schedule();},
    setAppearance(value){const next=value.color.split(',').map(Number);if(next.length===3&&next.every(Number.isFinite))color=next.map(v=>v/255);glow=Math.max(.1,Math.min(1,value.glow));motion=value.motion!==false;schedule();}
  };
}
