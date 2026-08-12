import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import {
  Send, Upload, FileText, Brain, X, Loader2, AlertCircle,
  CheckCircle, Trash2, RefreshCw, Plus,
  Search, Tag, ChevronLeft, BookOpen, Layers, Home
} from 'lucide-react';
import { API_URL } from '../config/api';
import contextService from '../services/contextService';
import { useNavigate } from 'react-router-dom';
import './Atlas.css';
import '../components/SocialHubChrome.css';

const PLANET_VERT = `
  varying vec2 vUv; varying vec3 vNormal; varying vec3 vViewDir;
  void main(){
    vUv=uv; vNormal=normalize(normalMatrix*normal);
    vec4 mv=modelViewMatrix*vec4(position,1.0);
    vViewDir=normalize(-mv.xyz);
    gl_Position=projectionMatrix*mv;
  }
`;
const PLANET_FRAG = `
  uniform vec3 uColorA,uColorB; uniform float uTime,uZoom;
  varying vec2 vUv; varying vec3 vNormal,vViewDir;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
  float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.1;a*=0.48;}return v;}
  void main(){
    vec3 L=normalize(vec3(4.0,6.0,5.0));
    float lit=0.15+0.85*max(dot(vNormal,L),0.0);
    float t=uTime*0.01;
    float pat=fbm(vUv*4.0+vec2(t,t*0.7))*0.50+fbm(vUv*9.0-vec2(t*0.6,-t*0.4))*0.32+noise(vUv*18.0+vec2(-t*0.3,t*0.5))*0.18;
    vec3 col=mix(uColorA,uColorB,pat*0.60+vUv.y*0.30)*lit;
    col+=uColorB*pow(1.0-max(dot(vNormal,vViewDir),0.0),2.0)*(0.70+uZoom*0.60);
    col+=vec3(pow(max(dot(reflect(-L,vNormal),vViewDir),0.0),28.0))*0.25;
    gl_FragColor=vec4(col,1.0);
  }
`;

const ATMO_VERT = `
  varying vec3 vNormal,vViewDir;
  void main(){vNormal=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.0);vViewDir=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}
`;
const ATMO_FRAG = `
  uniform vec3 uColor; uniform float uPower,uIntensity;
  varying vec3 vNormal,vViewDir;
  void main(){float r=pow(1.0-max(dot(vNormal,vViewDir),0.0),uPower);gl_FragColor=vec4(uColor,r*uIntensity);}
`;

const FLOW_VERT = `
  uniform vec3 uA,uB; uniform float uPhase,uN;
  attribute float aIdx; varying float vLife;
  void main(){
    float t=fract(aIdx/uN+uPhase);
    float h=0.26;
    float a = t<h*0.15 ? t/(h*0.15) : t<h ? 1.0-(t-h*0.15)/(h*0.85) : 0.0;
    vLife=a;
    gl_PointSize=(2.0+a*4.5)*(1.0-t*0.2);
    gl_Position=projectionMatrix*viewMatrix*vec4(mix(uA,uB,t),1.0);
  }
`;
const FLOW_FRAG = `
  uniform vec3 uColor; varying float vLife;
  void main(){
    if(vLife<=0.001)discard;
    float d=length(gl_PointCoord-0.5)*2.0;
    gl_FragColor=vec4(uColor,vLife*(1.0-smoothstep(0.0,1.0,d))*0.90);
  }
`;

const G_MAIN  = [0.843,0.702,0.549];
const G_LIGHT = [0.929,0.835,0.690];
const G_DEEP  = [0.478,0.329,0.208];
const G_DIM   = [0.722,0.565,0.408];
const G_PALE  = [0.961,0.918,0.835];

const HEX_MAIN  = 0xD7B38C;
const HEX_LIGHT = 0xEDD5B0;
const HEX_DEEP  = 0x7A5435;
const HEX_DIM   = 0xB89068;
const HEX_BG    = 0x08060A;

const WORLDS = [
  {
    key:'oracle',  label:'ORACLE',  sub:'KNOW-IT-ALL',  side:'left', type:'icosa',
    desc:'Ask anything — Oracle searches your documents and curriculum to give cited, intelligent answers.',
    pos:[-14, -1, -4],
    colorA:G_PALE,  colorB:G_LIGHT, atmoColor:G_PALE,  atmoIntensity:0.82, coreRadius:1.6,
  },
  {
    key:'archive', label:'ARCHIVE', sub:'CURRICULUM LIBRARY', side:'bottom', type:'rings',
    desc:'Browse all encoded curriculum documents across every subject and grade level.',
    pos:[0, -6, -11],
    colorA:G_DEEP,  colorB:G_DIM,   atmoColor:G_DIM,   atmoIntensity:0.68, coreRadius:2.0,
  },
  {
    key:'vault',   label:'VAULT',   sub:'MY DOCUMENTS',   side:'right', type:'cube',
    desc:'Upload your own PDFs and notes. Toggle docs as live AI context for personalized answers.',
    pos:[14, -1, -4],
    colorA:G_DIM,   colorB:G_MAIN,  atmoColor:G_LIGHT, atmoIntensity:0.78, coreRadius:1.4,
  },
];

const HOME_CAM  = new THREE.Vector3(0, 6, 22);
const HOME_LOOK = new THREE.Vector3(0, -5, -6);

function fmtDate(iso){
  if(!iso) return '';
  try{ return new Date(iso).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'2-digit'}); }
  catch{ return ''; }
}
function fmtBytes(n){
  if(!n) return '';
  if(n<1024) return `${n}B`;
  if(n<1048576) return `${(n/1024).toFixed(0)}KB`;
  return `${(n/1048576).toFixed(1)}MB`;
}

function UploadModal({ open, onClose, onDone }){
  const [file,setFile]       = useState(null);
  const [subject,setSubject] = useState('');
  const [loading,setLoading] = useState(false);
  const [error,setError]     = useState('');
  const [success,setSuccess] = useState(false);
  const [drag,setDrag]       = useState(false);
  const inputRef             = useRef();
  useEffect(()=>{ if(open){ setFile(null);setError('');setSuccess(false); } },[open]);
  const submit = async()=>{
    if(!file){ setError('Choose a file first.'); return; }
    setLoading(true); setError('');
    try{
      await contextService.uploadDocument(file,subject,'','private');
      setSuccess(true); if(onDone)onDone(); setTimeout(onClose,1400);
    } catch(e){ setError(e.message||'Upload failed'); }
    finally{ setLoading(false); }
  };
  if(!open) return null;
  return (
    <div className="atl-modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="atl-modal">
        <div className="atl-modal-hd"><span>UPLOAD TO VAULT</span><button className="atl-modal-close" onClick={onClose} aria-label="Close upload modal" title="Close upload modal"><X size={16}/></button></div>
        {success?(
          <div className="atl-modal-success"><CheckCircle size={36}/><p>ADDED TO YOUR VAULT</p></div>
        ):(
          <>
            <div className={`atl-drop-zone${drag?' atl-drop-zone--over':''}${file?' atl-drop-zone--has':''}`}
              onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)}
              onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)setFile(f);}}
              onClick={()=>inputRef.current?.click()}
              onKeyDown={e=>{ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
              role="button"
              tabIndex={0}>
              <input ref={inputRef} type="file" accept=".pdf,.txt,.md" style={{display:'none'}} onChange={e=>setFile(e.target.files[0])}/>
              {file?(
                <div className="atl-drop-file"><FileText size={22}/><span>{file.name}</span><span className="atl-drop-size">{fmtBytes(file.size)}</span><button onClick={e=>{e.stopPropagation();setFile(null);}}><X size={12}/></button></div>
              ):(
                <><Upload size={28} className="atl-drop-icon"/><p>DROP PDF, TXT, OR MD</p><span>OR CLICK TO BROWSE</span></>
              )}
            </div>
            <input className="atl-modal-subject" placeholder="SUBJECT (OPTIONAL)" value={subject} onChange={e=>setSubject(e.target.value)}/>
            {error&&<div className="atl-modal-err"><AlertCircle size={13}/>{error}</div>}
            <div className="atl-modal-actions">
              <button className="atl-btn atl-btn--ghost" onClick={onClose}>CANCEL</button>
              <button className="atl-btn atl-btn--accent" onClick={submit} disabled={loading||!file}>
                {loading?<Loader2 size={14} className="atl-spin"/>:<Upload size={14}/>}{loading?'UPLOADING':'UPLOAD'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DocCard({ doc, active, onToggle, onAsk, onDelete }){
  const [expanded,setExpanded] = useState(false);
  return (
    <div
      className={`atl-doc-card${active?' atl-doc-card--active':''}`}
      onClick={()=>onToggle(doc.doc_id)}
      onKeyDown={(e)=>{ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(doc.doc_id); } }}
      role="button"
      tabIndex={0}
      title={active?'Click to remove from Oracle context':'Click to add to Oracle context'}
    >
      <div className="atl-doc-card-top">
        <div className="atl-doc-icon-wrap"><FileText size={18}/></div>
        <div className="atl-doc-name-wrap">
          <div className="atl-doc-name" title={doc.filename}>{(doc.filename||'UNTITLED').toUpperCase()}</div>
          {doc.subject&&<span className="atl-doc-subject-badge">{doc.subject.toUpperCase()}</span>}
        </div>
        <div className={`atl-doc-ctx-toggle${active?' atl-doc-ctx-toggle--on':''}`}>
          {active?<CheckCircle size={17}/>:<Plus size={17}/>}
        </div>
      </div>

      {active&&<div className="atl-doc-oracle-label"><Layers size={9}/>ACTIVE IN ORACLE</div>}

      {doc.ai_summary&&(
        <p className={`atl-doc-summary${expanded?'':' atl-doc-summary--clamp'}`}
           onClick={e=>{e.stopPropagation();setExpanded(v=>!v)}}>
          {doc.ai_summary}
        </p>
      )}

      <div className="atl-doc-meta">
        {doc.chunk_count>0&&<span>{doc.chunk_count} CHUNKS</span>}
        {doc.file_size&&<span>{fmtBytes(doc.file_size)}</span>}
        {doc.created_at&&<span>{fmtDate(doc.created_at).toUpperCase()}</span>}
        {doc.page_count&&<span>{doc.page_count} PAGES</span>}
      </div>

      {doc.topic_tags?.length>0&&(
        <div className="atl-doc-tags">
          {doc.topic_tags.slice(0,5).map(t=>(
            <span key={t} className="atl-doc-tag"><Tag size={9}/>{t.toUpperCase()}</span>
          ))}
        </div>
      )}

      <div className="atl-doc-actions" onClick={e=>e.stopPropagation()}>
        <button className="atl-doc-action-btn" onClick={()=>onAsk(doc)}>
          <Brain size={12}/>ASK ORACLE
        </button>
        <button className="atl-doc-action-btn atl-doc-action-btn--del" onClick={()=>onDelete(doc.doc_id)}>
          <Trash2 size={12}/>REMOVE
        </button>
      </div>
    </div>
  );
}

function HsDocCard({ doc }){
  const [expanded,setExpanded]=useState(false);
  return (
    <div className="atl-hs-doc-card">
      <div className="atl-hs-doc-header">
        <div className="atl-doc-icon-wrap"><FileText size={16}/></div>
        <div className="atl-hs-doc-name-block">
          <div className="atl-doc-name" title={doc.filename}>{(doc.filename||'UNTITLED').replace(/\.[^.]+$/,'').toUpperCase()}</div>
          <div className="atl-hs-doc-badges">
            {doc.subject&&<span className="atl-hs-badge atl-hs-badge--subject">{doc.subject.toUpperCase()}</span>}
            {doc.grade_level&&<span className="atl-hs-badge atl-hs-badge--grade">{doc.grade_level}</span>}
          </div>
        </div>
      </div>
      {doc.ai_summary&&(
        <p className={`atl-doc-summary${expanded?'':' atl-doc-summary--clamp'}`} onClick={()=>setExpanded(v=>!v)}>
          {doc.ai_summary}
        </p>
      )}
      {doc.topic_tags?.length>0&&(
        <div className="atl-doc-tags">
          {doc.topic_tags.slice(0,6).map(t=>(
            <span key={t} className="atl-doc-tag"><Tag size={9}/>{t.toUpperCase()}</span>
          ))}
        </div>
      )}
      <div className="atl-doc-meta">
        {doc.chunk_count>0&&<span>{doc.chunk_count} CHUNKS</span>}
        {doc.page_count&&<span>{doc.page_count} PAGES</span>}
        {doc.file_size&&<span>{fmtBytes(doc.file_size)}</span>}
        {doc.source_name&&<span className="atl-hs-source-name">{doc.source_name.toUpperCase()}</span>}
      </div>
    </div>
  );
}

export default function Atlas(){
  const canvasRef      = useRef(null);
  const threeRef       = useRef({});
  const labelRefs      = useRef([]);
  const rafRef         = useRef(null);
  const activeWorldRef = useRef(null);

  const [activeWorld,   setActiveWorld]   = useState(null);
  const [userDocs,      setUserDocs]      = useState([]);
  const [hsSubjects,    setHsSubjects]    = useState([]);
  const [hsStats,       setHsStats]       = useState({});
  const [dataLoading,   setDataLoading]   = useState(false);
  const [askHistory,    setAskHistory]    = useState([]);
  const [askInput,      setAskInput]      = useState('');
  const [askLoading,    setAskLoading]    = useState(false);
  const [askUseHs,      setAskUseHs]      = useState(true);
  const [uploadOpen,    setUploadOpen]    = useState(false);
  const [vaultSearch,   setVaultSearch]   = useState('');
  const [activeDocIds,  setActiveDocIds]  = useState(new Set());
  const [vaultSubject,  setVaultSubject]  = useState('');
  const [docsError,     setDocsError]     = useState(null);
  const [hsDocs,           setHsDocs]           = useState([]);
  const [hsDocsSearch,     setHsDocsSearch]     = useState('');
  const [hsGradeFilter,    setHsGradeFilter]    = useState('');
  const [hsSubjectFilter,  setHsSubjectFilter]  = useState('');
  const [vaultDrag,        setVaultDrag]        = useState(false);
  const oracleEndRef = useRef(null);
  const navigate = useNavigate();

  
  useEffect(()=>{
    const container = canvasRef.current;
    if(!container) return;
    const W=container.clientWidth, H=container.clientHeight;

    const renderer = new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    renderer.setSize(W,H);
    renderer.setClearColor(HEX_BG,1);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog   = new THREE.FogExp2(HEX_BG,0.0045);

    const camera = new THREE.PerspectiveCamera(52,W/H,0.1,900);
    camera.position.copy(HOME_CAM);
    camera.lookAt(HOME_LOOK);

    const clock = new THREE.Clock();

    
    scene.add(new THREE.AmbientLight(HEX_LIGHT,0.08));
    const keyL=new THREE.DirectionalLight(0xffffff,1.5); keyL.position.set(10,18,14); scene.add(keyL);
    const fillL=new THREE.DirectionalLight(HEX_MAIN,0.32); fillL.position.set(-10,-6,-6); scene.add(fillL);

    
    const mkStars=(n,sz,op,spread)=>{
      const a=new Float32Array(n*3);
      for(let i=0;i<n;i++){a[i*3]=(Math.random()-0.5)*spread;a[i*3+1]=(Math.random()-0.5)*spread;a[i*3+2]=(Math.random()-0.5)*spread;}
      const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(a,3));
      return new THREE.Points(g,new THREE.PointsMaterial({color:HEX_LIGHT,size:sz,sizeAttenuation:true,transparent:true,opacity:op}));
    };
    scene.add(mkStars(9000,0.14,0.38,750));
    scene.add(mkStars(1400,0.32,0.65,550));

    
    const bgMesh=new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(120,3)),
      new THREE.LineBasicMaterial({color:HEX_MAIN,transparent:true,opacity:0.022})
    );
    scene.add(bgMesh);

    
    const nNodes=Array.from({length:70},()=>new THREE.Vector3((Math.random()-0.5)*140,(Math.random()-0.5)*80,-45-Math.random()*55));
    const nVerts=[];
    for(let i=0;i<nNodes.length;i++) for(let j=i+1;j<nNodes.length;j++) if(nNodes[i].distanceTo(nNodes[j])<20) nVerts.push(nNodes[i].x,nNodes[i].y,nNodes[i].z,nNodes[j].x,nNodes[j].y,nNodes[j].z);
    const nGeo=new THREE.BufferGeometry(); nGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(nVerts),3));
    scene.add(new THREE.LineSegments(nGeo,new THREE.LineBasicMaterial({color:HEX_MAIN,transparent:true,opacity:0.07})));

    
    {
      const C=54,S=3.4,pts=new Float32Array(C*C*3); let gi=0;
      for(let r=0;r<C;r++) for(let c=0;c<C;c++){pts[gi++]=(c-(C-1)*0.5)*S;pts[gi++]=-26;pts[gi++]=(r-(C-1)*0.5)*S-28;}
      const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pts,3));
      scene.add(new THREE.Points(g,new THREE.PointsMaterial({color:HEX_DEEP,size:0.058,sizeAttenuation:true,transparent:true,opacity:0.48})));
    }

    
    [[-32,12,-65],[22,-16,-85],[0,28,-72]].forEach(([cx,cy,cz])=>{
      const n=650,p=new Float32Array(n*3);
      for(let i=0;i<n;i++){const r=20+Math.random()*15,t=Math.random()*Math.PI*2,ph=Math.acos(2*Math.random()-1);p[i*3]=cx+r*Math.sin(ph)*Math.cos(t);p[i*3+1]=cy+r*Math.sin(ph)*Math.sin(t);p[i*3+2]=cz+r*Math.cos(ph);}
      const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(p,3));
      scene.add(new THREE.Points(g,new THREE.PointsMaterial({color:HEX_DIM,size:0.19,sizeAttenuation:true,transparent:true,opacity:0.13})));
    });

    
    const mkAtmoMat=(color,power,intensity)=>new THREE.ShaderMaterial({
      vertexShader:ATMO_VERT,fragmentShader:ATMO_FRAG,
      uniforms:{uColor:{value:new THREE.Vector3(...color)},uPower:{value:power},uIntensity:{value:intensity}},
      transparent:true,side:THREE.FrontSide,depthWrite:false,blending:THREE.AdditiveBlending,
    });
    const mkAtmoMesh=(color,r,power,intensity)=>{
      const mat=mkAtmoMat(color,power,intensity);
      return {mesh:new THREE.Mesh(new THREE.SphereGeometry(r,32,32),mat),mat};
    };
    const mkWf=(geo,color,opacity)=>new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false})
    );
    const mkRingDots=(radius,count,color,opacity,size=0.07)=>{
      const a=new Float32Array(count*3);
      for(let i=0;i<count;i++){const ang=(i/count)*Math.PI*2;a[i*3]=Math.cos(ang)*radius;a[i*3+1]=0;a[i*3+2]=Math.sin(ang)*radius;}
      const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(a,3));
      return new THREE.Points(g,new THREE.PointsMaterial({color,size,sizeAttenuation:true,transparent:true,opacity}));
    };
    const mkPulse=(baseR,color)=>{
      const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending});
      const mesh=new THREE.Mesh(new THREE.RingGeometry(baseR,baseR+0.15,80),mat);
      mesh.rotation.x=Math.PI*0.5;
      return {mesh,mat,t:0};
    };

    
    const oracleGroup=new THREE.Group();
    scene.add(oracleGroup);
    {
      const w=WORLDS[0];
      const sMat=new THREE.ShaderMaterial({
        vertexShader:PLANET_VERT,fragmentShader:PLANET_FRAG,
        uniforms:{uColorA:{value:new THREE.Vector3(...w.colorA)},uColorB:{value:new THREE.Vector3(...w.colorB)},uTime:{value:0},uZoom:{value:0}},
      });
      const mesh=new THREE.Mesh(new THREE.SphereGeometry(w.coreRadius,64,64),sMat);
      oracleGroup.add(mesh);
      const {mesh:am,mat:atmoMat}=mkAtmoMesh(w.atmoColor,w.coreRadius*1.55,2.2,w.atmoIntensity);
      oracleGroup.add(am);
      const {mesh:gm,mat:glow0Mat}=mkAtmoMesh(G_PALE,w.coreRadius*1.28,1.1,1.0);
      oracleGroup.add(gm);
      const {mesh:hm}=mkAtmoMesh(G_MAIN,w.coreRadius*3.4,1.0,0.22);
      oracleGroup.add(hm);

      const ico1=mkWf(new THREE.IcosahedronGeometry(2.6,2),HEX_LIGHT,0.40);
      const ico2=mkWf(new THREE.IcosahedronGeometry(3.6,2),HEX_MAIN, 0.22);
      const ico3=mkWf(new THREE.IcosahedronGeometry(4.8,1),HEX_DEEP, 0.10);
      oracleGroup.add(ico1); oracleGroup.add(ico2); oracleGroup.add(ico3);

      
      const ivp=(new THREE.IcosahedronGeometry(2.6,1)).attributes.position;
      const uniq=[]; const seen=new Set();
      for(let i=0;i<ivp.count;i++){const k=`${ivp.getX(i).toFixed(2)},${ivp.getY(i).toFixed(2)},${ivp.getZ(i).toFixed(2)}`;if(!seen.has(k)){seen.add(k);uniq.push(ivp.getX(i),ivp.getY(i),ivp.getZ(i));}}
      const vg=new THREE.BufferGeometry(); vg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(uniq),3));
      const vDots=new THREE.Points(vg,new THREE.PointsMaterial({color:HEX_LIGHT,size:0.20,sizeAttenuation:true,transparent:true,opacity:0.92,blending:THREE.AdditiveBlending}));
      oracleGroup.add(vDots);

      const orbitRing=mkRingDots(5.5,200,HEX_LIGHT,0.30,0.060);
      oracleGroup.add(orbitRing);

      const pulse=mkPulse(w.coreRadius*1.1,HEX_LIGHT); pulse.t=0;
      oracleGroup.add(pulse.mesh);
      oracleGroup.add(new THREE.PointLight(HEX_LIGHT,0.85,36));

      WORLDS[0]._three={group:oracleGroup,mesh,sMat,atmoMat,glow0Mat,ico1,ico2,ico3,vDots,orbitRing,pulse,bounceT:-1,bounceDur:1.3};
      oracleGroup.position.set(...WORLDS[0].pos);
    }

    
    const archiveGroup=new THREE.Group();
    scene.add(archiveGroup);
    {
      const w=WORLDS[1];
      const sMat=new THREE.ShaderMaterial({
        vertexShader:PLANET_VERT,fragmentShader:PLANET_FRAG,
        uniforms:{uColorA:{value:new THREE.Vector3(...w.colorA)},uColorB:{value:new THREE.Vector3(...w.colorB)},uTime:{value:0},uZoom:{value:0}},
      });
      const mesh=new THREE.Mesh(new THREE.SphereGeometry(w.coreRadius,64,64),sMat);
      archiveGroup.add(mesh);
      const {mesh:am,mat:atmoMat}=mkAtmoMesh(w.atmoColor,w.coreRadius*1.50,2.0,w.atmoIntensity);
      archiveGroup.add(am);
      const {mesh:hm,mat:haloMat}=mkAtmoMesh(G_DIM,w.coreRadius*3.2,1.0,0.20);
      archiveGroup.add(hm);

      
      const satMat=new THREE.MeshBasicMaterial({color:HEX_LIGHT,transparent:true,opacity:0.14,side:THREE.DoubleSide,depthWrite:false});
      const satRing=new THREE.Mesh(new THREE.RingGeometry(w.coreRadius*1.8,w.coreRadius*3.2,140,2),satMat);
      satRing.rotation.x=Math.PI*0.5+0.20; satRing.rotation.z=0.14;
      archiveGroup.add(satRing);
      const satWf=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.RingGeometry(w.coreRadius*1.8,w.coreRadius*3.2,64,1)),new THREE.LineBasicMaterial({color:HEX_MAIN,transparent:true,opacity:0.28,depthWrite:false}));
      satWf.rotation.copy(satRing.rotation); archiveGroup.add(satWf);

      
      const ring1=mkRingDots(4.5,320,HEX_LIGHT,0.55,0.075);
      archiveGroup.add(ring1);

      const ring2Grp=new THREE.Group(); ring2Grp.rotation.x=Math.PI*0.5;
      const ring2=mkRingDots(3.8,260,HEX_MAIN,0.48,0.068); ring2Grp.add(ring2);
      archiveGroup.add(ring2Grp);

      const ring3Grp=new THREE.Group(); ring3Grp.rotation.z=Math.PI*0.25; ring3Grp.rotation.x=Math.PI*0.30;
      const ring3=mkRingDots(4.8,220,HEX_DIM,0.38,0.062); ring3Grp.add(ring3);
      archiveGroup.add(ring3Grp);

      const ring4=mkRingDots(6.5,440,HEX_DEEP,0.30,0.058);
      archiveGroup.add(ring4);

      const arcIco=mkWf(new THREE.IcosahedronGeometry(w.coreRadius*1.18,1),HEX_DIM,0.24);
      archiveGroup.add(arcIco);

      const pulse=mkPulse(w.coreRadius*1.1,HEX_MAIN); pulse.t=1.8;
      archiveGroup.add(pulse.mesh);
      archiveGroup.add(new THREE.PointLight(HEX_DIM,0.75,40));

      WORLDS[1]._three={group:archiveGroup,mesh,sMat,atmoMat,haloMat,ring1,ring2,ring2Grp,ring3,ring3Grp,ring4,arcIco,pulse,bounceT:-1,bounceDur:1.3};
      archiveGroup.position.set(...WORLDS[1].pos);
    }

    
    const vaultGroup=new THREE.Group();
    scene.add(vaultGroup);
    {
      const w=WORLDS[2];
      const sMat=new THREE.ShaderMaterial({
        vertexShader:PLANET_VERT,fragmentShader:PLANET_FRAG,
        uniforms:{uColorA:{value:new THREE.Vector3(...w.colorA)},uColorB:{value:new THREE.Vector3(...w.colorB)},uTime:{value:0},uZoom:{value:0}},
      });
      const mesh=new THREE.Mesh(new THREE.SphereGeometry(w.coreRadius,64,64),sMat);
      vaultGroup.add(mesh);
      const {mesh:am,mat:atmoMat}=mkAtmoMesh(w.atmoColor,w.coreRadius*1.55,2.2,w.atmoIntensity);
      vaultGroup.add(am);
      const {mesh:hm,mat:haloMat}=mkAtmoMesh(G_MAIN,w.coreRadius*3.2,1.0,0.22);
      vaultGroup.add(hm);

      const cube1=mkWf(new THREE.BoxGeometry(2.8,2.8,2.8),HEX_LIGHT,0.58);
      const cube2=mkWf(new THREE.BoxGeometry(4.2,4.2,4.2),HEX_MAIN, 0.30);
      const cube3=mkWf(new THREE.BoxGeometry(5.8,5.8,5.8),HEX_DEEP, 0.12);
      vaultGroup.add(cube1); vaultGroup.add(cube2); vaultGroup.add(cube3);

      
      const cvArr=[-1.4,-1.4,-1.4,1.4,-1.4,-1.4,-1.4,1.4,-1.4,1.4,1.4,-1.4,-1.4,-1.4,1.4,1.4,-1.4,1.4,-1.4,1.4,1.4,1.4,1.4,1.4];
      const cvg=new THREE.BufferGeometry(); cvg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(cvArr),3));
      const cvDots=new THREE.Points(cvg,new THREE.PointsMaterial({color:HEX_LIGHT,size:0.24,sizeAttenuation:true,transparent:true,opacity:0.96,blending:THREE.AdditiveBlending}));
      vaultGroup.add(cvDots);

      
      const SHELL=800,sp=new Float32Array(SHELL*3);
      for(let i=0;i<SHELL;i++){const r=3.2+Math.random()*1.0,t=Math.random()*Math.PI*2,ph=Math.acos(2*Math.random()-1);sp[i*3]=r*Math.sin(ph)*Math.cos(t);sp[i*3+1]=r*Math.sin(ph)*Math.sin(t);sp[i*3+2]=r*Math.cos(ph);}
      const sg=new THREE.BufferGeometry(); sg.setAttribute('position',new THREE.BufferAttribute(sp,3));
      const shellPts=new THREE.Points(sg,new THREE.PointsMaterial({color:HEX_MAIN,size:0.060,sizeAttenuation:true,transparent:true,opacity:0.52}));
      vaultGroup.add(shellPts);

      const eqRing=mkRingDots(4.8,240,HEX_LIGHT,0.30,0.062);
      vaultGroup.add(eqRing);

      const pulse=mkPulse(w.coreRadius*1.1,HEX_LIGHT); pulse.t=0.9;
      vaultGroup.add(pulse.mesh);
      vaultGroup.add(new THREE.PointLight(HEX_MAIN,0.80,34));

      WORLDS[2]._three={group:vaultGroup,mesh,sMat,atmoMat,haloMat,cube1,cube2,cube3,cvDots,shellPts,eqRing,pulse,bounceT:-1,bounceDur:1.3};
      vaultGroup.position.set(...WORLDS[2].pos);
    }

    
    const FN=90;
    const pA=new THREE.Vector3(...WORLDS[0].pos);
    const pB=new THREE.Vector3(...WORLDS[1].pos);
    const pC=new THREE.Vector3(...WORLDS[2].pos);

    const buildFlow=(posA,posB,phaseOff,speed)=>{
      const idx=new Float32Array(FN),posArr=new Float32Array(FN*3);
      for(let i=0;i<FN;i++){
        idx[i]=i;
        const t=i/FN;
        posArr[i*3]=posA.x+(posB.x-posA.x)*t;
        posArr[i*3+1]=posA.y+(posB.y-posA.y)*t;
        posArr[i*3+2]=posA.z+(posB.z-posA.z)*t;
      }
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.BufferAttribute(posArr,3));
      g.setAttribute('aIdx',new THREE.BufferAttribute(idx,1));
      const mat=new THREE.ShaderMaterial({
        vertexShader:FLOW_VERT,fragmentShader:FLOW_FRAG,
        uniforms:{uA:{value:posA.clone()},uB:{value:posB.clone()},uPhase:{value:phaseOff},uN:{value:FN},uColor:{value:new THREE.Color(HEX_MAIN)}},
        transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      });
      const pts=new THREE.Points(g,mat); pts.frustumCulled=false; scene.add(pts);
      return {mat,speed};
    };

    const flowLines=[
      buildFlow(pA,pB,0.00,0.13), buildFlow(pB,pA,0.50,0.13),
      buildFlow(pB,pC,0.22,0.10), buildFlow(pC,pB,0.72,0.10),
      buildFlow(pA,pC,0.44,0.11), buildFlow(pC,pA,0.94,0.11),
    ];

    
    const raycaster=new THREE.Raycaster(), mouse=new THREE.Vector2();
    const meshes=WORLDS.map(w=>w._three.mesh);

    const onClick=e=>{
      const rect=renderer.domElement.getBoundingClientRect();
      mouse.x=((e.clientX-rect.left)/rect.width)*2-1;
      mouse.y=-((e.clientY-rect.top)/rect.height)*2+1;
      raycaster.setFromCamera(mouse,camera);
      const hits=raycaster.intersectObjects(meshes);
      if(hits.length>0){
        const wd=WORLDS.find(w=>w._three.mesh===hits[0].object);
        if(wd){ wd._three.bounceT=0; setActiveWorld(prev=>prev===wd.key?null:wd.key); }
      }
    };
    renderer.domElement.addEventListener('click',onClick);

    const onResize=()=>{const nW=container.clientWidth,nH=container.clientHeight;camera.aspect=nW/nH;camera.updateProjectionMatrix();renderer.setSize(nW,nH);};
    window.addEventListener('resize',onResize);

    const camTarget ={pos:HOME_CAM.clone(),look:HOME_LOOK.clone()};
    const camCurrent={pos:HOME_CAM.clone(),look:HOME_LOOK.clone()};

    threeRef.current={renderer,scene,camera,camTarget,camCurrent,flowLines,bgMesh};

    
    const animate=()=>{
      rafRef.current=requestAnimationFrame(animate);
      const delta=Math.min(clock.getDelta(),0.07);
      const elapsed=clock.getElapsedTime();

      bgMesh.rotation.y=elapsed*0.010; bgMesh.rotation.x=elapsed*0.005;

      const activeKey=activeWorldRef.current;
      const worldPositions=[];

      WORLDS.forEach((w,wi)=>{
        const td=w._three;
        const [bx,by,bz]=w.pos;

        
        if(td.bounceT<0){
          td.group.position.set(
            bx+Math.sin(elapsed*0.18+wi*2.1)*0.22,
            by+Math.sin(elapsed*0.13+wi*1.4)*0.13,
            bz
          );
        }

        
        if(td.bounceT>=0){
          td.bounceT+=delta;
          const bt=Math.min(td.bounceT/td.bounceDur,1.0);
          const surge=Math.sin(bt*Math.PI);
          const wp2=new THREE.Vector3(); td.group.getWorldPosition(wp2);
          const dir=camera.position.clone().sub(wp2).normalize();
          td.group.position.set(bx,by,bz).addScaledVector(dir,surge*4.0);
          if(bt>=1.0){ td.bounceT=-1; }
        }

        const wp=new THREE.Vector3(); td.group.getWorldPosition(wp);
        worldPositions.push(wp);

        const dist=camera.position.distanceTo(wp);
        const close=Math.max(0,Math.min(1,1.0-(dist-2.5)/10.0));

        
        td.mesh.rotation.y=elapsed*(0.50+wi*0.15);
        td.mesh.rotation.x=Math.sin(elapsed*0.20+wi*1.0)*0.06;
        td.sMat.uniforms.uTime.value=elapsed;
        td.sMat.uniforms.uZoom.value=close;
        td.atmoMat.uniforms.uIntensity.value=w.atmoIntensity*(1.0+close*1.8)+Math.sin(elapsed*1.2+wi*2.0)*0.09;

        
        {const p=td.pulse;p.t+=delta*0.55;const dur=5.0,pct=(p.t%dur)/dur;p.mesh.scale.setScalar(1.0+pct*5.0);p.mat.opacity=Math.max(0,0.28*(1.0-pct));}

        if(w.type==='icosa'){
          td.ico1.rotation.y=elapsed*0.44; td.ico1.rotation.x=elapsed*0.22;
          td.ico2.rotation.y=-elapsed*0.28; td.ico2.rotation.z=elapsed*0.16;
          td.ico3.rotation.x=elapsed*0.12; td.ico3.rotation.z=-elapsed*0.09;
          td.vDots.rotation.copy(td.ico1.rotation);
          td.orbitRing.rotation.y=elapsed*0.09;
          td.ico1.material.opacity=0.40+close*0.44+Math.sin(elapsed*0.9)*0.04;
          td.ico2.material.opacity=0.22+close*0.28;
          td.ico3.material.opacity=0.10+close*0.18;
          td.glow0Mat.uniforms.uIntensity.value=0.92+Math.sin(elapsed*2.4)*0.30;
        }
        if(w.type==='rings'){
          td.ring1.rotation.y=elapsed*0.22;
          td.ring2Grp.rotation.y=elapsed*0.18; td.ring2Grp.rotation.x=Math.PI*0.5+elapsed*0.10;
          td.ring3Grp.rotation.z=Math.PI*0.25+elapsed*0.14; td.ring3Grp.rotation.x=Math.PI*0.30-elapsed*0.08;
          td.ring4.rotation.y=-elapsed*0.10;
          td.arcIco.rotation.y=elapsed*0.30; td.arcIco.rotation.x=-elapsed*0.18;
          td.ring1.material.opacity=0.55+close*0.32;
          td.ring4.material.opacity=0.30+close*0.24;
        }
        if(w.type==='cube'){
          td.cube1.rotation.y=elapsed*0.40; td.cube1.rotation.x=elapsed*0.26;
          td.cube2.rotation.y=-elapsed*0.24; td.cube2.rotation.z=elapsed*0.20;
          td.cube3.rotation.x=-elapsed*0.15; td.cube3.rotation.z=elapsed*0.12;
          td.cvDots.rotation.copy(td.cube1.rotation);
          td.shellPts.rotation.y=elapsed*0.07;
          td.eqRing.rotation.y=elapsed*0.14;
          td.cube1.material.opacity=0.58+close*0.36+Math.sin(elapsed*0.7)*0.05;
          td.cube2.material.opacity=0.30+close*0.28;
          td.cube3.material.opacity=0.12+close*0.16;
        }
      });

      
      flowLines.forEach(fl=>{
        fl.mat.uniforms.uPhase.value=(fl.mat.uniforms.uPhase.value+delta*fl.speed)%1.0;
      });

      
      if(activeKey===null){
        camTarget.pos.copy(HOME_CAM); camTarget.look.copy(HOME_LOOK);
      } else {
        const idx=WORLDS.findIndex(w=>w.key===activeKey);
        if(idx>=0&&worldPositions[idx]){
          const wp=worldPositions[idx],wd=WORLDS[idx];
          const zoomDist=wd.coreRadius*3.8+1.5;
          camTarget.pos.copy(wp).addScaledVector(HOME_CAM.clone().sub(wp).normalize(),zoomDist);
          camTarget.look.copy(wp);
        }
      }
      camCurrent.pos.lerp(camTarget.pos,0.035);
      camCurrent.look.lerp(camTarget.look,0.035);
      camera.position.copy(camCurrent.pos);
      camera.lookAt(camCurrent.look);
      if(activeKey===null){ camera.position.x+=Math.sin(elapsed*0.09)*0.40; camera.position.y+=Math.sin(elapsed*0.07)*0.20; }

      
      const cW=container.clientWidth,cH=container.clientHeight;
      const isHome=activeKey===null;
      labelRefs.current.forEach((el,i)=>{
        if(!el||!worldPositions[i]) return;
        const v=worldPositions[i].clone().project(camera);
        el.style.left=`${(v.x+1)/2*cW}px`;
        el.style.top=`${-(v.y-1)/2*cH}px`;
        el.style.opacity=isHome?'1':'0';
        el.style.pointerEvents=isHome?'auto':'none';
      });

      renderer.render(scene,camera);
    };
    animate();

    return ()=>{
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize',onResize);
      renderer.domElement.removeEventListener('click',onClick);
      renderer.dispose();
      WORLDS.forEach(w=>{w._three=null;});
      if(container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  },[]); 

  useEffect(()=>{ activeWorldRef.current=activeWorld; },[activeWorld]);

  
  const loadAll=useCallback(async()=>{
    setDataLoading(true);
    setDocsError(null);
    
    try{
      const d=await contextService.listDocuments();
      const list=Array.isArray(d)?d:Array.isArray(d?.user_docs)?d.user_docs:Array.isArray(d?.documents)?d.documents:Array.isArray(d?.docs)?d.docs:[];
      setUserDocs(list);
      if(Array.isArray(d?.hs_docs)) setHsDocs(d.hs_docs);
    } catch(e){
      console.error('Documents load failed:',e);
      setDocsError(e.message||'Failed to load documents');
    }
    
    try{
      const [subs,stats]=await Promise.allSettled([
        contextService.getHsSubjects(),
        fetch(`${API_URL}/context/hs/stats`,{headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}}).then(r=>r.ok?r.json():{}),
      ]);
      if(subs.status==='fulfilled') setHsSubjects(subs.value.subjects||[]);
      if(stats.status==='fulfilled') setHsStats(stats.value);
    } catch{  }
    finally{ setDataLoading(false); }
  },[]);

  useEffect(()=>{ loadAll(); },[loadAll]);
  
  useEffect(()=>{ if(activeWorld==='vault') loadAll(); },[activeWorld]); 

  useEffect(()=>{ if(oracleEndRef.current) oracleEndRef.current.scrollIntoView({behavior:'smooth'}); },[askHistory]);

  const handleAsk=useCallback(async(q)=>{
    const question=(q||askInput).trim();
    if(!question||askLoading) return;
    setAskInput('');
    setAskHistory(prev=>[...prev,{question,answer:null,sources:[],loading:true}]);
    setAskLoading(true);
    try{
      const opts={useHs:askUseHs,topK:6};
      if(activeDocIds.size>0) opts.doc_ids=[...activeDocIds];
      const res=await contextService.askKnowledgeBase(question,opts);
      setAskHistory(prev=>{const n=[...prev];n[n.length-1]={question,answer:res.answer,sources:res.sources||[],loading:false};return n;});
    } catch(e){
      setAskHistory(prev=>{const n=[...prev];n[n.length-1]={question,answer:null,sources:[],loading:false,error:e.message||'Failed'};return n;});
    } finally{ setAskLoading(false); }
  },[askInput,askLoading,askUseHs,activeDocIds]);

  const handleDelete=useCallback(async(docId)=>{
    if(!window.confirm('Remove from your vault?')) return;
    try{
      await contextService.deleteDocument(docId);
      setUserDocs(prev=>prev.filter(d=>d.doc_id!==docId));
      setActiveDocIds(prev=>{const n=new Set(prev);n.delete(docId);return n;});
    } catch{  }
  },[]);

  const toggleDoc=useCallback((docId)=>{
    setActiveDocIds(prev=>{const n=new Set(prev);n.has(docId)?n.delete(docId):n.add(docId);return n;});
  },[]);

  const handleDocAsk=useCallback((doc)=>{
    setAskInput(`Summarise and explain the key points from ${doc.filename}`);
    setActiveWorld('oracle');
    if(!activeDocIds.has(doc.doc_id)) toggleDoc(doc.doc_id);
  },[activeDocIds,toggleDoc]);

  const totalChunks=hsStats.total_chunks||0;

  
  const vaultSubjects=[...new Set(userDocs.map(d=>d.subject).filter(Boolean))];
  const filteredDocs=userDocs.filter(d=>{
    const matchSearch=!vaultSearch||(d.filename||'').toLowerCase().includes(vaultSearch.toLowerCase())||(d.ai_summary||'').toLowerCase().includes(vaultSearch.toLowerCase());
    const matchSubject=!vaultSubject||d.subject===vaultSubject;
    return matchSearch&&matchSubject;
  });

  const hsGrades=[...new Set(hsDocs.map(d=>d.grade_level).filter(Boolean))].sort();
  const archiveSubjects=[...new Set(hsDocs.map(d=>d.subject).filter(Boolean))].sort();
  const filteredHsDocs=hsDocs.filter(d=>{
    const matchSearch=!hsDocsSearch
      ||(d.filename||'').toLowerCase().includes(hsDocsSearch.toLowerCase())
      ||(d.ai_summary||'').toLowerCase().includes(hsDocsSearch.toLowerCase())
      ||(d.subject||'').toLowerCase().includes(hsDocsSearch.toLowerCase());
    const matchGrade=!hsGradeFilter||d.grade_level===hsGradeFilter;
    const matchSubject=!hsSubjectFilter||d.subject===hsSubjectFilter;
    return matchSearch&&matchGrade&&matchSubject;
  });

  
  return (
    <div className="atl-root">
      <div className="shc-topbar" style={{position:'fixed',top:0,left:0,right:0,zIndex:10,background:'rgba(10,8,6,0.7)',backdropFilter:'blur(12px)',WebkitBackdropFilter:'blur(12px)'}}>
        <div className="shc-tagline"><span>LEARNING,</span> UNIFIED</div>
        <div className="shc-topbar-right">
          <button className="shc-top-btn" type="button" onClick={() => navigate('/dashboard-cerbyl')}>Dashboard</button>
        </div>
      </div>
      <div ref={canvasRef} className="atl-canvas"/>

      {}
      {WORLDS.map((w,i)=>(
        <div key={w.key} ref={el=>{labelRefs.current[i]=el;}} className={`atl-sphere-label atl-sphere-label--${w.side}`} onClick={()=>setActiveWorld(w.key)}>
          <span className="atl-sphere-label-name">{w.label}</span>
          <span className="atl-sphere-label-sub">{w.sub}</span>
          <span className="atl-sphere-label-desc">{w.desc}</span>
        </div>
      ))}

      {}
      <div className="atl-topbar">
        <nav className="atl-header-nav">
          {WORLDS.map(w=>(
            <button key={w.key} className={`atl-nav-btn${activeWorld===w.key?' atl-nav-btn--active':''}`} onClick={()=>setActiveWorld(activeWorld===w.key?null:w.key)}>
              {w.label}
            </button>
          ))}
        </nav>
        {activeDocIds.size>0&&(
          <div className="atl-ctx-indicator">
            <Layers size={12}/>{activeDocIds.size} IN CONTEXT
            <button onClick={()=>setActiveDocIds(new Set())}><X size={10}/></button>
          </div>
        )}
        <button className="atl-btn atl-btn--accent" onClick={()=>setUploadOpen(true)}><Plus size={13}/>ADD</button>
      </div>

      {}
      {activeWorld===null&&(
        <div className="atl-home-overlay">
          {}
          <div className="atl-home-brand">
            <h1 className="atl-home-title">cerbyl</h1>
            <p className="atl-home-sub">YOUR LIVING KNOWLEDGE UNIVERSE</p>
          </div>

          {}
          <div className="atl-home-bottom">
            <p className="atl-home-hint">CLICK A WORLD TO EXPLORE</p>
            <button className="atl-home-dash-btn" onClick={()=>navigate('/dashboard-cerbyl')}>
              <Home size={14}/>DASHBOARD
            </button>
          </div>
        </div>
      )}

      {}
      {activeWorld!==null&&(
        <div className="atl-panel">
          <button className="atl-panel-back" onClick={()=>setActiveWorld(null)}><ChevronLeft size={15}/>BACK TO UNIVERSE</button>

          {}
          {activeWorld==='oracle'&&(
            <div className={`atl-panel-body${askHistory.length===0?' atl-oracle-body-hero':''}`}>

              {}
              {activeDocIds.size>0&&(
                <div className="atl-oracle-ctx-bar">
                  <Layers size={12}/>
                  <span>USING {activeDocIds.size} DOCUMENT{activeDocIds.size>1?'S':''} AS CONTEXT</span>
                  <div className="atl-oracle-ctx-docs">
                    {userDocs.filter(d=>activeDocIds.has(d.doc_id)).map(d=>(
                      <span key={d.doc_id} className="atl-oracle-ctx-pill">
                        {(d.filename||'').replace(/\.[^.]+$/,'').toUpperCase().slice(0,18)}
                        <button onClick={()=>toggleDoc(d.doc_id)}><X size={9}/></button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {askHistory.length===0?(
                
                <div className="atl-oracle-hero">
                  <div className="atl-oracle-glow-halo">
                    <div className="atl-oracle-glow-ring atl-oracle-glow-ring--1"/>
                    <div className="atl-oracle-glow-ring atl-oracle-glow-ring--2"/>
                    <div className="atl-oracle-glow-ring atl-oracle-glow-ring--3"/>
                    <div className="atl-oracle-glow-core">
                      <Brain size={22} className="atl-oracle-brain-icon"/>
                    </div>
                  </div>

                  <div className="atl-oracle-hero-wordmark">ORACLE</div>
                  <div className="atl-oracle-hero-tagline">THE KNOW · IT · ALL</div>

                  <div className="atl-oracle-knowledge-stats">
                    <div className="atl-oracle-kstat">
                      <span className="atl-oracle-kstat-val">{hsSubjects.length||0}</span>
                      <span className="atl-oracle-kstat-lbl">SUBJECTS</span>
                    </div>
                    <div className="atl-oracle-kstat-sep"/>
                    <div className="atl-oracle-kstat">
                      <span className="atl-oracle-kstat-val">{userDocs.length||0}</span>
                      <span className="atl-oracle-kstat-lbl">YOUR DOCS</span>
                    </div>
                    <div className="atl-oracle-kstat-sep"/>
                    <div className="atl-oracle-kstat">
                      <span className="atl-oracle-kstat-val">{(totalChunks||0).toLocaleString()}</span>
                      <span className="atl-oracle-kstat-lbl">FRAGMENTS</span>
                    </div>
                  </div>

                  <div className="atl-oracle-hero-form">
                    <div className="atl-oracle-hero-input-wrap">
                      <textarea
                        className="atl-oracle-hero-textarea"
                        placeholder="Ask me anything — topics, flashcards, study material, concepts..."
                        value={askInput}
                        onChange={e=>setAskInput(e.target.value)}
                        onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleAsk();}}}
                        rows={3}
                        disabled={askLoading}
                      />
                      <div className="atl-oracle-hero-row">
                        <button
                          className={`atl-oracle-src-pill${askUseHs?' atl-oracle-src-pill--on':''}`}
                          onClick={()=>setAskUseHs(v=>!v)}
                          type="button"
                        >
                          <BookOpen size={11}/>
                          {askUseHs?'CURRICULUM ON':'CURRICULUM OFF'}
                        </button>
                        <button className="atl-oracle-hero-send" onClick={()=>handleAsk()} disabled={askLoading||!askInput.trim()}>
                          {askLoading?<Loader2 size={15} className="atl-spin"/>:<Send size={15}/>}
                          <span>{askLoading?'CONSULTING…':'ASK ORACLE'}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="atl-oracle-suggestions">
                    {[
                      'Explain natural selection',
                      'Integration by parts',
                      'Causes of World War I',
                      "Ohm's Law",
                      'What flashcards do I have?',
                      'Show available calculus material',
                      'Photosynthesis step by step',
                      "Newton's laws of motion",
                    ].map(s=>(
                      <button key={s} className="atl-oracle-sugg" onClick={()=>handleAsk(s)}>{s}</button>
                    ))}
                  </div>
                </div>

              ):(
                
                <>
                  <div className="atl-oracle-compact-hd">
                    <Brain size={13} className="atl-oracle-compact-icon"/>
                    <span>ORACLE · THE KNOW-IT-ALL</span>
                    <button className="atl-oracle-reset-btn" onClick={()=>setAskHistory([])} title="New conversation">
                      <RefreshCw size={11}/>
                    </button>
                  </div>

                  <div className="atl-oracle-history">
                    {askHistory.map((item,i)=>(
                      <div key={i} className="atl-oracle-turn">
                        <div className="atl-q-bubble">{item.question}</div>
                        {item.loading?(
                          <div className="atl-oracle-thinking">
                            <div className="atl-oracle-think-dots"><span/><span/><span/></div>
                            <span className="atl-oracle-think-text">CONSULTING KNOWLEDGE BASE</span>
                          </div>
                        ):item.error?(
                          <div className="atl-oracle-error"><AlertCircle size={13}/>{item.error}</div>
                        ):(
                          <div className="atl-answer-card">
                            <div className="atl-answer-card-hd">
                              <Brain size={13} className="atl-answer-card-icon"/>
                              <span className="atl-answer-card-label">ORACLE</span>
                            </div>
                            <p className="atl-answer-text">{item.answer}</p>
                            {item.sources?.length>0&&(
                              <div className="atl-answer-sources">
                                <div className="atl-answer-sources-lbl">SOURCES CONSULTED</div>
                                <div className="atl-answer-sources-grid">
                                  {item.sources.map((src,si)=>(
                                    <div key={si} className="atl-answer-source-card">
                                      <FileText size={11} className="atl-answer-source-icon"/>
                                      <div className="atl-answer-source-info">
                                        <span className="atl-answer-source-name">{(src.filename||`SOURCE ${si+1}`).replace(/\.[^.]+$/,'').toUpperCase()}</span>
                                        {src.page&&<span className="atl-answer-source-page">PAGE {src.page}</span>}
                                      </div>
                                      {src.source==='hs'&&<span className="atl-answer-source-badge">CURRICULUM</span>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="atl-answer-actions">
                              <button className="atl-answer-action" onClick={()=>navigate('/notes',{state:{topic:item.question}})}>
                                <BookOpen size={11}/>CREATE NOTES
                              </button>
                              <button className="atl-answer-action" onClick={()=>navigate('/flashcards',{state:{topic:item.question}})}>
                                <Layers size={11}/>MAKE FLASHCARDS
                              </button>
                              <button className="atl-answer-action" onClick={()=>navigate('/quiz-hub',{state:{topic:item.question}})}>
                                <Brain size={11}/>QUIZ ME
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    <div ref={oracleEndRef}/>
                  </div>

                  <div className="atl-oracle-input-row">
                    <textarea className="atl-oracle-textarea" placeholder="ASK THE ORACLE..." value={askInput} onChange={e=>setAskInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleAsk();}}} rows={2} disabled={askLoading}/>
                    <button className="atl-send-btn" onClick={()=>handleAsk()} disabled={askLoading||!askInput.trim()}>
                      {askLoading?<Loader2 size={16} className="atl-spin"/>:<Send size={16}/>}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {}
          {activeWorld==='archive'&&(
            <div className="atl-panel-body atl-panel-body--wide">
              <div className="atl-panel-hd">
                <div>
                  <h2 className="atl-panel-title">ARCHIVE</h2>
                  <p className="atl-panel-desc">
                    {dataLoading?'LOADING…':`${filteredHsDocs.length} DOCUMENT${filteredHsDocs.length!==1?'S':''} · ${archiveSubjects.length} SUBJECTS · ${totalChunks.toLocaleString()} FRAGMENTS`}
                  </p>
                </div>
              </div>

              {}
              <div className="atl-archive-toolbar">
                <div className="atl-search-row atl-archive-search">
                  <Search size={13}/>
                  <input className="atl-search-input" placeholder="SEARCH BY TITLE, SUBJECT, OR TOPIC..." value={hsDocsSearch} onChange={e=>setHsDocsSearch(e.target.value)}/>
                  {hsDocsSearch&&<button className="atl-clear-btn" onClick={()=>setHsDocsSearch('')}><X size={12}/></button>}
                </div>
                {archiveSubjects.length>0&&(
                  <div className="atl-archive-filter-row">
                    <span className="atl-archive-filter-lbl">SUBJECT</span>
                    <div className="atl-archive-filter-pills">
                      <button className={`atl-subject-pill${hsSubjectFilter===''?' atl-subject-pill--active':''}`} onClick={()=>setHsSubjectFilter('')}>ALL</button>
                      {archiveSubjects.map(s=>(
                        <button key={s} className={`atl-subject-pill${hsSubjectFilter===s?' atl-subject-pill--active':''}`} onClick={()=>setHsSubjectFilter(hsSubjectFilter===s?'':s)}>
                          {s.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {hsGrades.length>0&&(
                  <div className="atl-archive-filter-row">
                    <span className="atl-archive-filter-lbl">GRADE</span>
                    <div className="atl-archive-filter-pills">
                      <button className={`atl-subject-pill${hsGradeFilter===''?' atl-subject-pill--active':''}`} onClick={()=>setHsGradeFilter('')}>ALL</button>
                      {hsGrades.map(g=>(
                        <button key={g} className={`atl-subject-pill${hsGradeFilter===g?' atl-subject-pill--active':''}`} onClick={()=>setHsGradeFilter(hsGradeFilter===g?'':g)}>
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {dataLoading?(
                <div className="atl-loading"><Loader2 size={22} className="atl-spin"/></div>
              ):filteredHsDocs.length===0?(
                <div className="atl-vault-empty">
                  <BookOpen size={38} style={{opacity:0.28,marginBottom:14}}/>
                  <p>{hsDocs.length===0?'NO CURRICULUM DOCUMENTS FOUND.':'NO DOCUMENTS MATCH YOUR SEARCH.'}</p>
                </div>
              ):(
                <div className="atl-doc-grid">
                  {filteredHsDocs.map((doc,i)=>(
                    <HsDocCard key={doc.doc_id||i} doc={doc}/>
                  ))}
                </div>
              )}
            </div>
          )}

          {}
          {activeWorld==='vault'&&(
            <div className="atl-panel-body atl-panel-body--wide">
              {}
              <div className="atl-panel-hd">
                <div>
                  <h2 className="atl-panel-title">VAULT</h2>
                  <p className="atl-panel-desc">YOUR PERSONAL DOCUMENT LIBRARY · CLICK A DOCUMENT TO ADD IT TO ORACLE'S CONTEXT</p>
                </div>
                <div className="atl-panel-hd-actions">
                  <button className="atl-icon-btn" onClick={loadAll} title="Refresh"><RefreshCw size={13}/></button>
                </div>
              </div>

              {/* Upload strip — always visible */}
              <div
                className={`atl-vault-upload-strip${vaultDrag?' atl-vault-upload-strip--over':''}`}
                onClick={()=>setUploadOpen(true)}
                onKeyDown={(e)=>{ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setUploadOpen(true); } }}
                role="button"
                tabIndex={0}
                onDragOver={e=>{e.preventDefault();setVaultDrag(true);}}
                onDragLeave={()=>setVaultDrag(false)}
                onDrop={e=>{e.preventDefault();setVaultDrag(false);setUploadOpen(true);}}
              >
                <div className="atl-vault-upload-icon"><Upload size={16}/></div>
                <div className="atl-vault-upload-text">
                  <span className="atl-vault-upload-primary">DROP FILES HERE OR CLICK TO UPLOAD</span>
                  <span className="atl-vault-upload-types">PDF · TXT · MARKDOWN</span>
                </div>
              </div>

              {/* Active context bar — only when docs selected */}
              {activeDocIds.size>0&&(
                <div className="atl-vault-active-bar">
                  <div className="atl-vault-active-bar-left">
                    <div className="atl-vault-active-count">
                      <Layers size={15}/>
                      <span>{activeDocIds.size}</span>
                    </div>
                    <div className="atl-vault-active-info">
                      <span className="atl-vault-active-title">DOC{activeDocIds.size>1?'S':''} IN ORACLE CONTEXT</span>
                      <span className="atl-vault-active-sub">Oracle will focus on these when answering</span>
                    </div>
                  </div>
                  <div className="atl-vault-active-actions">
                    <button className="atl-vault-ctx-clear" onClick={()=>setActiveDocIds(new Set())}>CLEAR</button>
                    <button className="atl-vault-ctx-ask" onClick={()=>setActiveWorld('oracle')}>
                      <Brain size={12}/>ASK ORACLE
                    </button>
                  </div>
                </div>
              )}

              {/* Filters */}
              <div className="atl-vault-filters">
                <div className="atl-search-row atl-vault-search">
                  <Search size={13}/>
                  <input className="atl-search-input" placeholder="SEARCH YOUR VAULT..." value={vaultSearch} onChange={e=>setVaultSearch(e.target.value)}/>
                  {vaultSearch&&<button className="atl-clear-btn" onClick={()=>setVaultSearch('')}><X size={12}/></button>}
                </div>
                {vaultSubjects.length>0&&(
                  <div className="atl-vault-subject-pills">
                    <button className={`atl-subject-pill${vaultSubject===''?' atl-subject-pill--active':''}`} onClick={()=>setVaultSubject('')}>ALL</button>
                    {vaultSubjects.map(s=>(
                      <button key={s} className={`atl-subject-pill${vaultSubject===s?' atl-subject-pill--active':''}`} onClick={()=>setVaultSubject(vaultSubject===s?'':s)}>
                        {s.toUpperCase()}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {docsError&&(
                <div className="atl-vault-error">
                  <AlertCircle size={16}/>
                  <span>COULD NOT LOAD DOCUMENTS: {docsError.toUpperCase()}</span>
                  <button className="atl-btn atl-btn--ghost" onClick={loadAll}><RefreshCw size={12}/>RETRY</button>
                </div>
              )}
              {dataLoading?(
                <div className="atl-loading"><Loader2 size={22} className="atl-spin"/></div>
              ):!docsError&&filteredDocs.length===0?(
                <div className="atl-vault-empty">
                  {userDocs.length===0?(
                    <>
                      <div className="atl-vault-empty-icon"><Upload size={32}/></div>
                      <p className="atl-vault-empty-title">YOUR VAULT IS EMPTY</p>
                      <p className="atl-vault-empty-desc">Upload PDFs, notes, or markdown files. Oracle will use them to give you personalised, cited answers.</p>
                      <button className="atl-btn atl-btn--accent" onClick={()=>setUploadOpen(true)}><Upload size={13}/>UPLOAD FIRST DOCUMENT</button>
                    </>
                  ):(
                    <p>NO DOCUMENTS MATCH YOUR SEARCH.</p>
                  )}
                </div>
              ):(
                <div className="atl-doc-grid">
                  {filteredDocs.map((doc,i)=>(
                    <DocCard
                      key={doc.doc_id||i}
                      doc={doc}
                      active={activeDocIds.has(doc.doc_id)}
                      onToggle={toggleDoc}
                      onAsk={handleDocAsk}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <UploadModal open={uploadOpen} onClose={()=>setUploadOpen(false)} onDone={loadAll}/>
    </div>
  );
}
