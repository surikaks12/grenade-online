const express=require('express'),http=require('node:http'),crypto=require('node:crypto');
const {Server}=require('socket.io');const G=require('./game');const app=express(),server=http.createServer(app),io=new Server(server,{maxHttpBufferSize:16384});const rooms=new Map();app.use(express.static('public'));app.get('/health',(_,res)=>res.json({ok:true}));
function snapshot(r,p){return {code:r.code,host:r.host,me:p.id,phase:r.phase,stage:r.stage,round:r.round,turn:r.turn,message:r.message,settings:r.settings,deckCount:r.deck?.length||0,available:r.available||[],pending:r.pending||[],hand:p.hand,players:r.players.map(x=>({id:x.id,name:x.name,score:x.score,out:x.out,connected:!!x.socketId,count:x.hand.length})),result:r.result,winner:r.winner};}
function emit(r){for(const p of r.players)if(p.socketId)io.to(p.socketId).emit('state',snapshot(r,p));r.updated=Date.now();}
function name(s){return String(s||'').trim().slice(0,24)||'Player';}
function code(){let c;do{c=crypto.randomBytes(4).toString('hex').slice(0,6).toUpperCase();}while(rooms.has(c));return c;}
io.on('connection',socket=>{let last=0;socket.on('action',(data,ack)=>{if(typeof ack!=='function')ack=()=>{};try{if(Date.now()-last<80)throw Error('Please slow down.');last=Date.now();if(!data||typeof data!=='object')throw Error('Invalid request.');const {type}=data;
if(type==='create'||type==='join'){
 if(socket.data.room)throw Error('Reload to switch rooms.');let r;if(type==='create'){if(rooms.size>=1000)throw Error('Server room limit reached.');r={code:code(),players:[],phase:'lobby',round:0,settings:{scoreOthers:data.scoreOthers!==false,declareTiming:data.declareTiming==='after'?'after':'before'}};rooms.set(r.code,r);}else{r=rooms.get(String(data.code||'').toUpperCase().trim());if(!r)throw Error('Room not found.');}
 let p=typeof data.token==='string'?r.players.find(x=>x.token===data.token):null;
 if(p){if(p.socketId&&p.socketId!==socket.id){const old=io.sockets.sockets.get(p.socketId);if(old)old.disconnect(true);}}
 else {if(r.phase!=='lobby')throw Error('Game already started. Only returning players can join.');if(r.players.length>=8)throw Error('Room is full.');p={id:crypto.randomUUID(),token:crypto.randomBytes(24).toString('hex'),name:name(data.name),score:0,out:false,hand:[]};r.players.push(p);if(!r.host)r.host=p.id;}
 p.socketId=socket.id;socket.data.room=r.code;socket.data.player=p.id;socket.join(r.code);ack({ok:true,token:p.token,code:r.code});emit(r);return;
}
const r=rooms.get(socket.data.room),p=r?.players.find(x=>x.id===socket.data.player);if(!r||!p||p.socketId!==socket.id)throw Error('Join a room first.');
if(type==='start'){if(p.id!==r.host||r.phase!=='lobby')throw Error('Only the host can start.');if(r.players.length<2)throw Error('At least two players are required.');if(r.players.some(x=>!x.socketId))throw Error('Wait for everyone to connect, or remove disconnected players.');G.round(r);}
else if(type==='remove'){if(p.id!==r.host||r.phase!=='lobby')throw Error('Only the host can remove players before starting.');const target=r.players.find(x=>x.id===data.id);if(!target||target.socketId)throw Error('Only disconnected players can be removed.');r.players=r.players.filter(x=>x!==target);}
else if(type==='play')G.play(r,p,data.ids);
else if(type==='draw')G.draw(r,p,data.source,data.id);
else if(type==='declare')G.declare(r,p);
else if(type==='end'){if(r.phase!=='play'||r.turn!==p.id||r.stage!=='declare')throw Error('Not your end-turn step.');G.next(r);}
else if(type==='next'){if(p.id!==r.host||r.phase!=='results')throw Error('Only the host can advance after a round.');G.round(r);}
else throw Error('Unknown action.');emit(r);ack({ok:true});
}catch(e){ack({ok:false,error:e.message});}});
socket.on('disconnect',()=>{const r=rooms.get(socket.data.room);if(!r)return;const p=r.players.find(x=>x.id===socket.data.player);if(p?.socketId===socket.id)p.socketId=null;if(r.host===p?.id){const successor=r.players.find(x=>x.socketId);if(successor)r.host=successor.id;}emit(r);});});
setInterval(()=>{for(const [c,r]of rooms)if(!r.players.some(p=>p.socketId)&&Date.now()-r.updated>86400000)rooms.delete(c);},60000).unref();server.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Grenade listening on port '+(process.env.PORT||3000)));
