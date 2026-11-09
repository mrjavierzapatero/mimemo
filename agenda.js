/* Leteo: local, deterministic agenda preparation. No calendar or notification API. */
(function(root,factory){
  if(typeof module==='object' && module.exports) module.exports=factory();
  else root.LeteoAgenda=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const zone='Europe/Madrid',dayMs=86400000;
  const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const clean=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  const pad=n=>String(n).padStart(2,'0');
  function parts(instant){return Object.fromEntries(fmt.formatToParts(new Date(instant)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));}
  function dateString(p){return p.year+'-'+pad(p.month)+'-'+pad(p.day);}
  function dayAdd(date,n){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
  function validDate(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;const d=new Date(date+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===date&&Number(date.slice(0,4))>=1900&&Number(date.slice(0,4))<=2200;}
  // Test both Madrid offsets and verify a round trip: gaps/folds never silently normalize.
  function resolve(date,time){
    if(!validDate(date))return {error:'Fecha inexistente o fuera del intervalo1900–2200.'};
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return {error:'Indica una hora válida en formato24h (por ejemplo17:30).'};
    const nominal=Date.parse(date+'T'+time+':00Z'),candidates=[];
    for(const hours of [0,1,2]){
      const t=nominal-hours*3600000,p=parts(t);
      if(dateString(p)===date&&pad(p.hour)+':'+pad(p.minute)===time)candidates.push(new Date(t).toISOString());
    }
    if(candidates.length===0)return {error:'Esa hora no existe en Madrid por el cambio horario. Elige otra hora.'};
    if(candidates.length>1)return {error:'Esa hora se repite por el cambio horario. Elige una hora inequívoca.'};
    return {instant:candidates[0]};
  }
  const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const weekdays=['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
  const nums={una:1,un:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10,once:11,doce:12};
  const numberWords={...nums,uno:1,primero:1,trece:13,catorce:14,quince:15,dieciseis:16,diecisiete:17,dieciocho:18,diecinueve:19,veinte:20,veintiuno:21,veintiun:21,veintiuna:21,veintidos:22,veintitres:23,veinticuatro:24,veinticinco:25,veintiseis:26,veintisiete:27,veintiocho:28,veintinueve:29,treinta:30};
  for(const [tens,value] of [['treinta',30],['cuarenta',40],['cincuenta',50]]){
    numberWords[tens]=value;
    for(const unit of ['uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve'])numberWords[tens+' y '+unit]=value+numberWords[unit];
  }
  const wordPattern=limit=>Object.keys(numberWords).filter(w=>numberWords[w]<=limit).sort((a,b)=>b.length-a.length).map(w=>w.replace(/[aeiou]/g,v=>'['+v+({a:'á',e:'é',i:'í',o:'ó',u:'ú'}[v])+']').replace(/ /g,'\\s+')).join('|');
  const dateGap='(?:\\s+|\\s*[,.;]\\s*)';
  // Shared with the calendar: match raw text so source spans remain literal.
  const namedDatePattern='\\b(\\d{1,2}|'+wordPattern(31)+')'+dateGap+'(?:de'+dateGap+')?('+months.join('|')+'|setiembre)(?:'+dateGap+'(?:(?:de|del)'+dateGap+')?(\\d{4}))?\\b';
  const hourWord='\\d{1,2}|'+wordPattern(23),minuteWord='cuarto|\\d{1,2}|'+wordPattern(59);
  const timePrefix='(?:a\\s+)?las?\\s*';
  const timePattern='\\b(?:(?:'+timePrefix+')?(?<digital>\\d{1,2})\\s*[:h]\\s*(?<digits>\\d{2})|(?:'+timePrefix+')?(?<before>'+hourWord+')\\s+menos\\s+(?<subtract>'+minuteWord+')|'+timePrefix+'(?<spoken>'+hourWord+')(?:\\s+y\\s+(?<add>media|'+minuteWord+'))?)(?:\\s+(?:de|por)\\s+la\\s+(?<period>ma[ñn]ana|tarde|noche))?\\b';
  const dateReference='(?:pasado manana|manana|hoy|'+weekdays.join('|')+'|'+namedDatePattern+'|\\d{1,2}[/-]\\d{1,2}[/-]\\d{4})';
  const dateAlternatives=new RegExp('\\b'+dateReference+'\\b\\s*,?\\s+o\\s+(?:(?:el|este|proximo)\\s+)?'+dateReference+'\\b');
  const numberValue=value=>/^\d+$/.test(value)?Number(value):numberWords[clean(value)];
  function clockHour(h,period,issues){
    if(!period)return h;
    if(h>=1&&h<=12){
      if(period==='noche')return h===12?0:h>=8?h+12:h;
      return period==='tarde'&&h<12?h+12:h;
    }
    if(period==='tarde'&&h>=13&&h<=20||period==='noche'&&(h>=20&&h<=23||h===0))return h;
    issues.push('La hora y la franja del día no coinciden.');
    return 99;
  }
  function parse(text,now=new Date().toISOString()){
    const lo=clean(text).replace(/\b(a las?|de)(?=\d)/g,'$1 '),today=dateString(parts(now)),out={title:String(text).trim().slice(0,80),date:'',time:'',location:'',recurrence:'none',issues:[]};
    const full=lo.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/);
    const namedDates=[...lo.matchAll(new RegExp(namedDatePattern,'g'))],named=namedDates[0];
    const weekdayHits=weekdays.filter(w=>new RegExp('\\b'+w+'\\b').test(lo));
    if(full)out.date=full[3]+'-'+pad(full[2])+'-'+pad(full[1]);
    else if(named)out.date=(named[3]||today.slice(0,4))+'-'+pad(months.indexOf(named[2].replace('setiembre','septiembre'))+1)+'-'+pad(numberValue(named[1]));
    else if(/\bpasado manana\b/.test(lo))out.date=dayAdd(today,2);
    else if(/\bhoy\b/.test(lo))out.date=today;
    else if(/\bmanana\b/.test(lo)&&!(/de la manana/.test(lo)&&lo.replace(/de la manana/g,'').indexOf('manana')<0))out.date=dayAdd(today,1);
    else if(weekdayHits.length===1){
      let n=(weekdays.indexOf(weekdayHits[0])-new Date(today+'T12:00Z').getUTCDay()+7)%7;
      if(n===0&&/\bproximo\b/.test(lo))n=7;
      out.date=dayAdd(today,n);
    }
    if(/\b(cada dia|todos los dias|a diario)\b/.test(lo)){out.recurrence='daily';if(!out.date)out.date=today;}
    else if((weekdayHits.length===1&&/\b(?:cada|(?:todos )?los|todas las)\s+(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/.test(lo))||
      /\b(?:cada semana|todas las semanas|semanal(?:mente)?)\b/.test(lo)||/\b(?:todos los|todas las)[\s.,…]*$/.test(lo))out.recurrence='weekly';
    if(weekdayHits.length>1)out.issues.push('Hay varios días: prepara cada rutina por separado.');
    if(/\b(cada mes|mensual|quincenal|cada dos)\b/.test(lo)){out.date='';out.issues.push('Esa repetición todavía no se interpreta: elige una fecha y repetición explícitas.');}
    const clocks=[...lo.matchAll(new RegExp(timePattern,'g'))];
    const correctedClock=clocks.length>1&&clocks.every((hit,i)=>{
      if(i===0)return true;
      const previous=clocks[i-1],between=lo.slice(previous.index+previous[0].length,hit.index);
      return /^[\s,;]*(?:(?:perdon|no|mejor|quiero decir|o sea)\s*[,;]?\s*)?$/.test(between);
    });
    const clock=correctedClock?clocks.at(-1):clocks[0];
    if(clock){
      const {digital,digits,before,subtract,spoken,add,period}=clock.groups;
      const hour=digital||before||spoken,minutes=digits||subtract||add;
      let h=clockHour(numberValue(hour),period,out.issues),m=minutes==='media'?30:minutes==='cuarto'?15:minutes?numberValue(minutes):0;
      const assumedAfternoon=!period&&h>=1&&h<=7&&!hour.startsWith('0');
      if(assumedAfternoon)h+=12;
      if(before&&h<24){
        if(m>=1&&m<=59){h=(h+23)%24;m=60-m;}
        else m=99;
      }
      out.time=pad(h)+':'+pad(m);
      if(assumedAfternoon)out.issues.push('He interpretado la hora como '+out.time+'. Confirma mañana o tarde antes de guardar.');
    }
    const loc=String(text).match(/\ben\s+(.+?)(?=\s+(?:mañana\b|hoy\b|pasado mañana\b|a las?(?=\s|\d)|el (?:lunes|martes|miércoles|jueves|viernes|sábado|domingo)\b|cada\b)|[.;\n]|$)/i);
    if(loc)out.location=loc[1].trim().slice(0,160);
    if(dateAlternatives.test(lo.replace(/\b(?:de|por) la manana\b/g,''))){
      out.date='';out.issues.push('Hay alternativas de fecha: elige una fecha explícita.');
    }
    if(weekdayHits.length>1)out.date='';
    if((full||named)&&weekdayHits.length===1&&validDate(out.date)&&new Date(out.date+'T12:00Z').getUTCDay()!==weekdays.indexOf(weekdayHits[0])){out.date='';out.issues.push('El día de la semana no coincide con la fecha. Revisa cuál es correcto.');}
    if(/\bhoy\b/.test(lo)&&/\bmanana\b/.test(lo.replace(/de la manana/g,''))){out.date='';out.issues.push('Aparecen hoy y mañana: confirma una fecha.');}
    if(/\b(cancelar|cancela|anular|anula|cambia|cambiar)\b/.test(lo)){out.date='';out.time='';out.issues.push('Para cambiar o cancelar, abre la memoria guardada y usa Editar. Este campo prepara una cita nueva.');}
    if((lo.match(/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{4}\b/g)||[]).length>1||namedDates.length>1){out.date='';out.issues.push('Hay varias fechas: prepara cada cita por separado.');}
    if(clocks.length>1){
      if(correctedClock)out.issues.push('He tomado la última hora indicada, '+out.time+'. Revisa que sea la correcta.');
      else {out.time='';out.issues.push('Hay varias horas: elige una hora explícita.');}
    }
    const temporal=!!(full||named||clock||weekdayHits.length||/\b(hoy|manana|cada dia|a diario)\b/.test(lo));
    out.isAgenda=temporal||/\b(cita|dentista|reunion|rutina|recordar|recuerdame|avisame)\b/.test(lo);
    if(out.date&&!validDate(out.date)){out.issues.push('La fecha indicada no existe.');out.date='';}
    if(out.recurrence==='weekly'&&out.date&&out.time){
      const first=resolve(out.date,out.time);
      if(first.instant&&Date.parse(first.instant)<=Date.parse(now))out.date=dayAdd(out.date,7);
    }
    if(!out.date)out.issues.push('Falta una fecha clara.');
    if(!out.time)out.issues.push('Falta una hora inequívoca.');
    return out;
  }
  function reminders(date,instant,now){
    const notices=[
      {kind:'day-before',label:'Día anterior · 20:00',at:resolve(dayAdd(date,-1),'20:00').instant},
      {kind:'same-day-morning',label:'Ese día · 09:00',at:resolve(date,'09:00').instant},
      {kind:'one-hour-before',label:'Una hora antes',at:new Date(Date.parse(instant)-3600000).toISOString()}
    ];
    return notices.map(r=>({...r,sent:false,previewOnly:true,status:Date.parse(r.at)>=Date.parse(instant)?'after-event':Date.parse(r.at)<=Date.parse(now)?'omitted-past':'prepared'}));
  }
  function prepare(fields,now=new Date().toISOString()){
    const errors=[],r=resolve(fields.date,fields.time);
    if(!String(fields.title||'').trim())errors.push('Falta el título.');
    if(!['none','daily','weekly'].includes(fields.recurrence))errors.push('Repetición no admitida.');
    if(r.error)errors.push(r.error);
    if(r.instant&&Date.parse(r.instant)<=Date.parse(now))errors.push('La cita está en el pasado. Revisa la fecha y hora.');
    if(errors.length)return {ok:false,errors};
    const occurrences=[];
    for(let i=0;i<(fields.recurrence==='none'?1:4);i++){
      const date=dayAdd(fields.date,i*(fields.recurrence==='weekly'?7:1)),item=resolve(date,fields.time);
      if(item.error)return {ok:false,errors:['Revisa la repetición del '+date+': '+item.error]};
      occurrences.push({date,instant:item.instant,reminders:reminders(date,item.instant,now)});
    }
    const agenda={schemaVersion:1,title:String(fields.title).trim().slice(0,80),date:fields.date,time:fields.time,location:String(fields.location||'').trim().slice(0,160),recurrence:fields.recurrence,timeZone:zone,status:'confirmed',deliveryMode:'preview-only',instant:r.instant,occurrences,confirmedAt:now};
    agenda.fingerprint=JSON.stringify([clean(agenda.title),agenda.instant,clean(agenda.location),agenda.recurrence]);
    return {ok:true,agenda};
  }
  function duplicate(items,agenda,excludeId){return items.find(i=>i.id!==excludeId&&i.agenda&&i.agenda.status!=='cancelled'&&i.agenda.fingerprint===agenda.fingerprint);}
  return {zone,parse,prepare,resolve,parts,dayAdd,duplicate,namedDatePattern,timePattern};
});
