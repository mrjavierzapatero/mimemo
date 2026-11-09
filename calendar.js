/* Leteo: deterministic multi-entry preparation and civil-date calendar. No external writes. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./agenda.js'));
  else root.LeteoCalendar=factory(root.LeteoAgenda);
})(typeof globalThis!=='undefined'?globalThis:this,function(A){
  'use strict';
  const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const dayNames=['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
  const namedDatePrefix='(?:(?:el|este|pr[oó]ximo)\\s+)?(?:d[ií]a\\s+)?(?:(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\\b\\s*,?\\s*(?:d[ií]a\\s+)?)?';
  const iso=d=>d.toISOString().slice(0,10);
  const civil=d=>new Date(d+'T12:00:00Z');
  const today=now=>{const p=A.parts(now);return p.year+'-'+String(p.month).padStart(2,'0')+'-'+String(p.day).padStart(2,'0');};
  const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number(d.slice(0,4))>=1900&&Number(d.slice(0,4))<=2200&&Number.isFinite(+civil(d))&&iso(civil(d))===d;
  function week(date){const offset=(civil(date).getUTCDay()+6)%7;return Array.from({length:7},(_,i)=>A.dayAdd(date,i-offset));}
  function month(date){return Array.from({length:42},(_,i)=>A.dayAdd(week(date.slice(0,7)+'-01')[0],i));}
  function moveMonth(date,delta){const d=civil(date.slice(0,7)+'-01');d.setUTCMonth(d.getUTCMonth()+delta);return iso(d);}
  function zoom(mode,ratio){return ratio>1.25&&mode==='month'?'week':ratio<0.8&&mode==='week'?'month':mode;}
  function sourceParts(text){
    // Boundaries are explicit temporal phrases, never number-only ages or times.
    const namedAnchor=namedDatePrefix+A.namedDatePattern;
    const pattern=new RegExp('\\b(?:'+namedAnchor+'|(?:el d[ií]a de )?(?:pasado ma[ñn]ana|hoy|ma[ñn]ana)|esta (?:tarde|noche|ma[ñn]ana)|(?:(?:el|este|pr[oó]ximo)\\s+)?(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)(?:\\s+\\d{1,2})?|\\d{1,2}[\\/-]\\d{1,2}[\\/-]\\d{4})\\b','gi');
    const anchors=[];
    for(const m of text.matchAll(pattern)){
      const before=fold(text.slice(Math.max(0,m.index-35),m.index));
      if(/(?:de|por) la\s*$/.test(before)||/\bo\s*$/.test(before))continue;
      // A weekday followed by a spelled-out date describes one date, not two entries.
      if(anchors.length&&/ de $/.test(text.slice(anchors.at(-1).index,m.index)))continue;
      let index=m.index;
      const connector=text.slice(0,index).match(/(?:\s+|[,.;])(?:(?:y\s+)?luego|y despu[eé]s|despu[eé]s|en el d[ií]a|y)\s*$/i);
      if(connector)index=connector.index;
      anchors.push({index,anchor:m[0],anchorIndex:m.index});
    }
    if(anchors.length<2)return [{text,start:0,end:text.length}];
    const result=[];
    for(let i=0;i<anchors.length;i++){
      const start=i===0?0:anchors[i].index,end=i+1<anchors.length?anchors[i+1].index:text.length;
      const part=text.slice(start,end).trim();if(part)result.push({text:part,start,end});
    }
    return result;
  }
  function parseEntry(source,now){
    const raw=source.text,lo=fold(raw),timePeriod=(lo.match(/(?:de la|por la|esta) (manana|tarde|noche)/)||[])[1];
    let input=raw.replace(/por la (mañana|tarde|noche)/gi,'de la $1').replace(/esta (tarde|noche|mañana)/gi,'hoy');
    if(timePeriod&&!/de la (mañana|tarde|noche)/i.test(input))input+=' de la '+timePeriod.replace('manana','mañana');
    const p=A.parse(input,now),issues=p.issues.filter(i=>!i.startsWith('Falta una hora'));
    const numbered=lo.match(/\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s+(\d{1,2})(?!\s+de\b)\b/);
    if(numbered&&p.date&&Number(p.date.slice(-2))!==Number(numbered[2])){p.date='';issues.push('El día del mes no coincide con el día de la semana. Revisa la fecha.');}
    // Explicit places only: reject discourse such as "en adelante" and "en el día".
    const loc=raw.match(/\ben\s+((?!(?:adelante|luego|el d[ií]a|para|cuanto|esa fecha)\b)[^.;\n]+?)(?=\s+(?:a las?\b|hoy\b|mañana\b|luego\b|cada\b|todos los\b|mandarle\b|tengo que\b|(?:el|este|pr[oó]ximo)\s+(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b)|[.;\n]|$)/i);
    const location=loc?loc[1].trim():'';
    const birthday=/\bcumplea[nñ]os\b/i.test(raw);
    let title=raw;
    if(birthday){const b=raw.match(/cumplea[nñ]os(?:\s+de)?\s+(.+?)(?=\s+\d{1,3}\s+a[nñ]os|\s+vale\b|\s+que lo\b|[.;\n]|$)/i);title=b?'Cumpleaños de '+b[1].trim():'Cumpleaños';}
    else {
      title=title.replace(/^(?:\s|[,.;]|luego\b|y\b|después\b|en el día\b)+/gi,'').trim();
      title=title.replace(new RegExp('^'+namedDatePrefix+A.namedDatePattern+'\\s*','i'),'');
      title=title.replace(/^(?:el día de )?(?:hoy|mañana|pasado mañana|esta tarde|esta noche|(?:el |este |próximo )?(?:lunes|martes|miércoles|jueves|viernes|sábado|domingo)(?:\s+\d{1,2})?|\d{1,2}[\/-]\d{1,2}[\/-]\d{4})\s*/i,'');
      title=title.replace(/^(?:tengo|tenemos|hay|es)\s+(?:que\s+)?/i,'').replace(/\s+(?:vale por ahora|por ahora no quiero|no quiero guardar nada más)[\s\S]*$/i,'').trim();
      title=title.replace(/^(?:por favor\s+)?(?:ponme|ap[uú]ntame|crea|guarda|recu[eé]rdame)\s+(?:(?:una?|la)\s+)?(?:alerta|aviso|recordatorio|cita)\b/i,'');
      title=title.replace(/\b(?:cada|todos los|todas las)\s+(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/gi,'');
      title=title.replace(/\b(?:cada semana|todas las semanas|semanal(?:mente)?|cada d[ií]a|todos los d[ií]as|a diario)\b/gi,'');
      title=title.replace(/\b(?:el|este|pr[oó]ximo)\s+(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)(?:\s+\d{1,2})?\b/gi,'');
      title=title.replace(/\ba\s+las?\s*\d{1,2}\s*[:h]\s*\d{2}(?:\s+(?:de|por) la (?:ma[ñn]ana|tarde|noche))?\b/gi,'');
      title=title.replace(new RegExp(A.spokenTimePattern,'gi'),'');
      title=title.replace(/[,;]?\s*(?:(?:y\s+)?entonces\s+)?(?:av[ií]same|me avisas|que me avises|tienes que avisarme|me tienes que avisar)\b[\s\S]*$/i,'');
      title=title.replace(/^[\s,.;]*(?:que\s+)?(?:tengo|tenemos|hay|es)\s+(?:que\s+)?/i,'');
      title=title.replace(/^[\s,.;]+|[\s,.;]+$/g,'').replace(/\s+/g,' ');
      if(title)title=title[0].toUpperCase()+title.slice(1);
    }
    // An absent hour is a date-only entry, visibly pending a reminder time; never midnight by inference.
    const allDay=!p.time;
    if(allDay)issues.push('Sin hora indicada: se guarda en el día. La hora de los avisos queda pendiente.');
    const noRepeat=/\b(?:sin repetir|no repetir|no lo repitas|solo este a[nñ]o)\b/i.test(raw);
    return {title:(title||raw).slice(0,80),date:p.date,time:p.time,allDay,location:location.slice(0,160),recurrence:birthday&&!noRepeat?'yearly':noRepeat?'none':p.recurrence,issues,source:raw,sourceStart:source.start,sourceEnd:source.end,isAgenda:p.isAgenda||birthday};
  }
  function parseMany(text,now=new Date().toISOString()){
    const raw=String(text||'').trim();
    if(!raw)return {text:raw,entries:[],isAgenda:false};
    const entries=[];
    const parts=/\b(?:cada|todos los|todas las)\s+(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+y\s+(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i.test(raw)?[{text:raw,start:0,end:raw.length}]:sourceParts(raw);
    for(const part of parts){
      const literal=raw.slice(part.start,part.end),boundaries=[0];
      for(const m of literal.matchAll(/\s+(?:y|luego|despu[eé]s)\s+(?=(?:a las?\s*(?:\d{1,2}|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\b|cumplea[ñn]os\b))/gi))boundaries.push(m.index);
      let inheritedDate='';
      for(let i=0;i<boundaries.length;i++){
        const start=part.start+boundaries[i],end=i+1<boundaries.length?part.start+boundaries[i+1]:part.end;
        const entry=parseEntry({text:raw.slice(start,end).trim(),start,end},now);
        if(i>0&&!entry.date&&inheritedDate){entry.date=inheritedDate;entry.issues=entry.issues.filter(issue=>!issue.startsWith('Falta una fecha'));}
        if(i===0)inheritedDate=entry.date;
        entries.push(entry);
      }
    }
    return {text:raw,entries,isAgenda:entries.some(e=>e.isAgenda),method:'bounded-spanish-rules',requiresConfirmation:true};
  }
  function prepare(fields,now=new Date().toISOString()){
    const errors=[],title=String(fields.title||'').trim();
    if(!title)errors.push('Falta el título.');
    if(!valid(fields.date))errors.push('Falta una fecha válida.');
    if(!['none','daily','weekly','yearly'].includes(fields.recurrence||'none'))errors.push('Repetición no admitida.');
    if(errors.length)return {ok:false,errors};
    const recurrence=fields.recurrence||'none';
    if(!fields.allDay){
      const timed=A.prepare({...fields,recurrence:recurrence==='yearly'?'none':recurrence},now);
      if(!timed.ok)return timed;
      timed.agenda.recurrence=recurrence;timed.agenda.allDay=false;
      timed.agenda.fingerprint=JSON.stringify([fold(title),fields.date,fields.time,recurrence,false]);
      return timed;
    }
    if(fields.date<today(now)&&recurrence!=='yearly')return {ok:false,errors:['La fecha está en el pasado. Revisa la fecha.']};
    const before=A.resolve(A.dayAdd(fields.date,-1),'20:00').instant,morning=A.resolve(fields.date,'09:00').instant;
    const pending=(kind,label,at)=>({kind,label,at,sent:false,previewOnly:true,status:at?(Date.parse(at)>Date.parse(now)?'prepared':'omitted-past'):'needs-time'});
    const agenda={schemaVersion:2,title:title.slice(0,80),date:fields.date,time:'',allDay:true,location:String(fields.location||'').trim().slice(0,160),recurrence,timeZone:A.zone,status:'confirmed',deliveryMode:'preview-only',instant:null,occurrences:[{date:fields.date,instant:null,reminders:[pending('day-before','Día anterior · 20:00',before),pending('same-day-morning','Ese día · 09:00',morning),pending('one-hour-before','Una hora antes',null)]}],confirmedAt:now};
    agenda.fingerprint=JSON.stringify([fold(agenda.title),agenda.date,'',recurrence,true]);
    return {ok:true,agenda};
  }
  function events(items,start,end){
    if(!valid(start)||!valid(end)||end<start||(+civil(end)-civil(start))/86400000>62)throw Error('Intervalo de calendario inválido');
    const out=[];
    for(const item of items){
      const a=item.agenda;if(!a||a.status==='cancelled'||!valid(a.date))continue;
      for(let date=start;date<=end;date=A.dayAdd(date,1)){
        if(date<a.date)continue;
        const delta=Math.round((civil(date)-civil(a.date))/86400000);
        const matches=a.recurrence==='yearly'?date.slice(5)===a.date.slice(5):a.recurrence==='daily'?true:a.recurrence==='weekly'?delta%7===0:date===a.date;
        if(matches)out.push({id:item.id,title:a.title,date,time:a.time||'',allDay:!!a.allDay,location:a.location||'',recurrence:a.recurrence,reminderStatus:a.allDay?'needs-time':'preview-only'});
      }
    }
    return out.sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
  }
  return {parseMany,prepare,events,month,week,moveMonth,zoom,today,valid};
});
