/* Local calendar UI. Existing memory persistence and concurrency guard remain the only writer. */
(function(){
  'use strict';
  const C=window.LeteoCalendar,A=window.LeteoAgenda;
  const $=id=>document.getElementById(id);
  const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const weekdayOptions=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].map((day,i)=>'<option value="'+((i+1)%7)+'">'+day+'</option>').join('');
  let batch=null,returnFocus=null,calendarDate=C.today(new Date().toISOString()),mode='month',pinch=null;
  const homeIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5M5.5 9v12h13V9M9.5 21v-7h5v7M3 21h18"/></svg>';
  $('app').insertAdjacentHTML('beforeend','<section class="view calendar-view" id="vCalendar" aria-label="Calendario personal"><header class="cal-header"><div id="calHeadingGroup"><h1 id="calHeading"></h1><p id="calSubtitle"></p></div><button type="button" class="cal-today" id="calToday">Hoy</button></header><div class="cal-modes" role="group" aria-label="Vista del calendario"><button type="button" data-mode="month">Mes</button><button type="button" data-mode="week">Semana</button><button type="button" data-mode="day">Día</button></div><p class="cal-help" id="calHelp" hidden></p><div id="calBody" class="cal-body"></div><nav class="cal-arrows" aria-label="Cambiar periodo"><button type="button" id="calPrevious" aria-label="Mes anterior">←</button><span id="calPeriod" aria-live="polite"></span><button type="button" id="calNext" aria-label="Mes siguiente">→</button></nav><nav class="cal-footer" aria-label="Navegación principal"><button type="button" class="home-button" id="calCapture" aria-label="Casa · volver a No olvidar">'+homeIcon+'<span>Casa</span></button></nav></section>');
  document.body.insertAdjacentHTML('beforeend','<div class="ov batch-overlay" id="batchOv" role="dialog" aria-modal="true" aria-labelledby="batchHeading"><form class="sh batch-sheet" id="batchForm" autocomplete="off"><div class="hdl"></div><h2 id="batchHeading">Revisa antes de guardar</h2><div id="batchCards"></div><details class="batch-original"><summary>Ver el dictado completo</summary><div id="batchTranscript" class="agenda-transcript"></div></details><div class="batch-reminders" id="batchReminders"><strong>Avisos previstos</strong><ul><li>Día anterior · 20:00</li><li>Ese día · 09:00</li><li>Una hora antes</li></ul><p>Avisos del teléfono pendientes de activar.</p></div><p id="batchStatus" role="status" aria-live="polite"></p><div class="agenda-actions"><button type="button" class="btn bg2" id="batchBack">Volver al dictado</button><button type="submit" class="btn bb" id="batchSave">Guardar cita</button></div></form></div>');
  const cancelButton=document.createElement('button');cancelButton.id='batchCancel';cancelButton.type='button';cancelButton.className='btn br';cancelButton.hidden=true;cancelButton.textContent='Cancelar cita';$('batchForm').append(cancelButton);
  const wheelMarkup=(name,label,count)=>'<div class="time-column"><span id="'+name+'Label">'+label+'</span><div id="'+name+'" class="time-wheel" role="spinbutton" tabindex="0" aria-labelledby="'+name+'Label" aria-valuemin="0" aria-valuemax="'+(count-1)+'">'+Array.from({length:count},(_,i)=>'<div aria-hidden="true" data-wheel-value="'+i+'">'+String(i).padStart(2,'0')+'</div>').join('')+'</div></div>';
  document.body.insertAdjacentHTML('beforeend','<dialog class="time-dialog" id="timeDialog" aria-labelledby="timeHeading"><h2 id="timeHeading">Elige la hora</h2><div class="time-columns">'+wheelMarkup('timeHours','Hora',24)+wheelMarkup('timeMinutes','Minutos',60)+'</div><div class="agenda-actions"><button type="button" class="btn bg2" id="timeCancel">Cancelar</button><button type="button" class="btn bb" id="timeApply">Establecer</button></div></dialog>');
  const timeDialog=$('timeDialog'),wheels=[$('timeHours'),$('timeMinutes')];
  let timeIndex=null;
  const wheelStep=wheel=>wheel.firstElementChild.offsetHeight;
  const wheelValue=wheel=>Math.max(0,Math.min(wheel.childElementCount-1,Math.round(wheel.scrollTop/(wheelStep(wheel)||1))));
  function showWheelValue(wheel){
    const value=wheelValue(wheel);
    wheel.querySelector('.is-selected')?.classList.remove('is-selected');
    wheel.children[value].classList.add('is-selected');
    wheel.setAttribute('aria-valuenow',value);
    wheel.setAttribute('aria-valuetext',String(value).padStart(2,'0'));
  }
  function setWheel(wheel,value){wheel.scrollTop=value*wheelStep(wheel);showWheelValue(wheel);}
  for(const wheel of wheels){
    wheel.addEventListener('scroll',()=>{if(timeDialog.open)showWheelValue(wheel);},{passive:true});
    wheel.addEventListener('click',event=>{if(event.target.dataset.wheelValue!==undefined)setWheel(wheel,Number(event.target.dataset.wheelValue));});
    wheel.addEventListener('keydown',event=>{
      const value=wheelValue(wheel),last=wheel.childElementCount-1;
      const keys={ArrowUp:value-1,ArrowDown:value+1,PageUp:value-5,PageDown:value+5,Home:0,End:last};
      if(!Object.hasOwn(keys,event.key))return;
      event.preventDefault();setWheel(wheel,Math.max(0,Math.min(last,keys[event.key])));
    });
  }
  function openTime(i){
    timeIndex=i;
    const now=A.parts(new Date()),fallback=[now.hour,0];
    const value=$('bTime'+i).value;
    timeDialog.showModal();
    (value?value.split(':').map(Number):fallback).forEach((n,j)=>setWheel(wheels[j],n));
  }
  $('timeCancel').addEventListener('click',()=>timeDialog.close());
  $('timeApply').addEventListener('click',()=>{
    if(timeIndex===null)return;
    const i=timeIndex,input=$('bTime'+i);
    input.value=wheels.map(wheel=>String(wheelValue(wheel)).padStart(2,'0')).join(':');
    input.dataset.confirmed='true';
    $('bAll'+i).checked=false;
    const date=$('bDate'+i);
    if(date.dataset.weekday&&$('bRepeat'+i).value==='weekly')date.value=C.nextWeekday(Number(date.dataset.weekday),input.value);
    timeDialog.close();refreshBatch();
  });
  $('calHelp').insertAdjacentHTML('afterend','<div class="cal-alert-controls" id="calAlertControls" hidden><p id="calAlertStatus" role="status"></p><button type="button" id="calActivateAlerts">Activar avisos</button></div>');
  const nativeAlerts=()=>window.LeteoNativeAlerts?.native?window.LeteoNativeAlerts:null;
  function updateAlertControls(){
    const controls=$('calAlertControls'),native=nativeAlerts();controls.hidden=!native;
    if(!native)return;
    const live=ideas.filter(item=>item.agenda&&item.agenda.status!=='cancelled');
    const pending=live.filter(item=>item.agenda.deliveryMode==='pending-permission'||!item.agenda.deliveryMode).length;
    const active=live.filter(item=>item.agenda.deliveryMode==='native-local').length;
    $('calAlertStatus').textContent=pending?pending+' '+(pending===1?'cita pendiente':'citas pendientes')+' de activar avisos.':active?active+' '+(active===1?'cita con avisos activos.':'citas con avisos activos.'):'Los avisos se activan al guardar una cita.';
    $('calActivateAlerts').hidden=!pending;
  }
  function applySyncResult(result){
    if(!result.ok){
      if(['notification-permission','exact-alarm-permission'].includes(result.reason)){
        let changed=false;
        for(const item of ideas){if(item.agenda&&item.agenda.status!=='cancelled'&&item.agenda.deliveryMode!=='pending-permission'){item.agenda.deliveryMode='pending-permission';changed=true;}}
        if(changed)saveIdeas();
      }
      updateAlertControls();return;
    }
    const scheduled=new Set(result.itemIds||[]);
    let changed=false;
    for(const item of ideas){
      if(!item.agenda||item.agenda.status==='cancelled')continue;
      const next=scheduled.has(item.id)?'native-local':'no-future-reminders';
      if(item.agenda.deliveryMode!==next){item.agenda.deliveryMode=next;changed=true;}
    }
    if(changed)saveIdeas();
    updateAlertControls();
  }
  function fields(i){return {title:$('bTitle'+i).value,date:$('bDate'+i).value,time:$('bTime'+i).value,allDay:$('bAll'+i).checked,location:$('bPlace'+i).value,recurrence:$('bRepeat'+i).value};}
  function weekdayName(date){return C.valid(date)?new Intl.DateTimeFormat('es-ES',{weekday:'long',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z')):'';}
  function reviewDate(date){return date.slice(8,10)+'/'+date.slice(5,7)+'/'+date.slice(0,4);}
  function reviewTime(time){
    const hour=Number(time.slice(0,2));
    return time+(hour<6?' de la madrugada':hour<12?' de la mañana':hour===12?' del mediodía':hour<21?' de la tarde':' de la noche');
  }
  function refreshBatch(){
    if(!batch)return;
    let selected=0,invalid=0;
    batch.entries.forEach((entry,i)=>{
      const f=fields(i),result=C.prepare(f),weekday=weekdayName(f.date),missingDate=!C.valid(f.date);
      const timeButton=$('bTimeButton'+i),timeConfirmed=$('bTime'+i).dataset.confirmed==='true';
      timeButton.textContent=f.allDay||!f.time?'Elegir hora':f.time;
      timeButton.setAttribute('aria-label','Hora: '+(f.allDay||!f.time?'elegir hora':f.time));
      $('bWeekWrap'+i).hidden=f.recurrence!=='weekly';
      $('bWeek'+i).value=missingDate?'':String(new Date(f.date+'T12:00:00Z').getUTCDay());
      $('bRepeat'+i).querySelector('option[value="weekly"]').textContent=weekday?'Cada '+weekday:'Cada semana';
      const unresolved=(entry.issues||[]).filter(issue=>!/^Falta una fecha/i.test(issue)&&((missingDate&&/coincide.*fecha|fecha/i.test(issue))||(!timeConfirmed&&!f.allDay&&f.time===entry.time&&/he interpretado la hora|he tomado la última hora/i.test(issue))));
      const errors=result.ok?[]:result.errors.filter(error=>!missingDate||!/^Falta una fecha/i.test(error));
      const dateHelp=missingDate?(f.recurrence==='weekly'?'Elige el día de la semana o completa la fecha para guardar.':'Toca el campo Fecha para completar la fecha; no hace falta repetir el dictado.'):'';
      const summary=result.ok?reviewDate(f.date)+' · '+(f.allDay?'Sin hora indicada':reviewTime(f.time))+'.':'';
      const weekly=f.recurrence==='weekly'&&weekday?'Se repetirá cada '+weekday+' desde el '+reviewDate(f.date)+'.':'';
      const status=$('bIssue'+i);
      status.classList.toggle('needs-review',!result.ok||unresolved.length>0);
      status.textContent=[...unresolved,...errors,dateHelp,summary,weekly].filter(Boolean).join(' ');
      selected++;if(!result.ok)invalid++;
    });
    $('batchSave').disabled=!selected||!!invalid;
    const preview=batch.entries.length?C.prepare(fields(0)):null;
    const reminders=preview?.ok?preview.agenda.occurrences?.[0]?.reminders:[];
    $('batchReminders').innerHTML='<strong>Avisos previstos</strong><ul>'+((reminders?.length?reminders:[{label:'Día anterior · 20:00'},{label:'Ese día · 09:00'},{label:'Una hora antes'}]).map(r=>'<li>'+html(r.label||'Aviso')+(r.at?'<span>'+html(formatAgendaInstant(r.at))+'</span>':'')+(['skipped-past','omitted-past'].includes(r.status)?'<span>Este aviso ya ha pasado.</span>':r.status==='needs-time'?'<span>Pendiente de añadir una hora.</span>':'')+'</li>').join(''))+'</ul><p>'+(nativeAlerts()?'Al guardar se activarán en el teléfono. Leteo pedirá permiso si hace falta.':'En esta prueba web no se enviarán al teléfono.')+'</p>';
    $('batchSave').textContent=batch.editId?'Guardar cambios':'Guardar cita';
    $('batchStatus').textContent=invalid?'Revisa las '+invalid+(invalid===1?' entrada marcada.':' entradas marcadas.'):'No se guarda nada hasta que confirmes.';
  }
  function openBatch(text,parsed){
    returnFocus=document.activeElement;batch=parsed;
    $('batchCancel').hidden=!parsed.editId;
    $('batchTranscript').textContent=text;
    $('batchCards').innerHTML=parsed.entries.map((entry,i)=>'<fieldset class="batch-card" id="bCard'+i+'"><legend>Cita</legend><label for="bTitle'+i+'">Qué tienes previsto</label><textarea rows="3" maxlength="80" id="bTitle'+i+'" required>'+html(entry.title)+'</textarea><div class="batch-fields"><div><label for="bDate'+i+'">Fecha</label><input type="date" id="bDate'+i+'" value="'+html(entry.date)+'" autocomplete="off" required></div><div><label for="bTimeButton'+i+'">Hora · 24 h</label><input type="hidden" id="bTime'+i+'" value="'+html(/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.time)?entry.time:'')+'"><button type="button" class="batch-time-trigger" id="bTimeButton'+i+'" data-time-index="'+i+'" aria-haspopup="dialog"></button></div></div><label class="batch-all"><input type="checkbox" id="bAll'+i+'" '+(entry.allDay?'checked':'')+'> Sin hora indicada</label><label for="bPlace'+i+'">Lugar · opcional</label><input id="bPlace'+i+'" maxlength="160" value="'+html(entry.location)+'" placeholder="Sin lugar indicado"><div class="batch-options"><label for="bRepeat'+i+'">Repetición</label><select id="bRepeat'+i+'">'+[['none','Una sola vez'],['daily','Cada día'],['weekly','Cada semana'],['yearly','Cada año']].map(([value,label])=>'<option value="'+value+'" '+(entry.recurrence===value?'selected':'')+'>'+label+'</option>').join('')+'</select></div><div class="batch-weekday" id="bWeekWrap'+i+'" hidden><label for="bWeek'+i+'">Día de la semana</label><select id="bWeek'+i+'" data-week-index="'+i+'"><option value="">Elige un día</option>'+weekdayOptions+'</select></div><p id="bIssue'+i+'" class="batch-issue"></p></fieldset>').join('');
    refreshBatch();openOv('batchOv');$('batchHeading').setAttribute('tabindex','-1');$('batchHeading').focus({preventScroll:true});$('batchForm').scrollTop=0;
  }
  function closeBatch(){batch=null;closeOv('batchOv');if(returnFocus?.focus)returnFocus.focus();}
  function same(a,b){return String(a.title).trim().toLocaleLowerCase('es')===String(b.title).trim().toLocaleLowerCase('es')&&a.date===b.date&&(a.time||'')===(b.time||'')&&a.recurrence===b.recurrence;}
  async function saveBatch(event){
    event.preventDefault();if(!batch)return;
    const chosen=[];
    for(let i=0;i<batch.entries.length;i++){
      const result=C.prepare(fields(i));if(!result.ok){refreshBatch();return;}
      if(ideas.some(item=>item.id!==batch.editId&&item.agenda?.status!=='cancelled'&&item.agenda&&same(item.agenda,result.agenda))||chosen.some(p=>same(p.agenda,result.agenda))){$('batchStatus').textContent='Ya tienes esta cita guardada. Revisa sus datos para evitar un duplicado.';return;}
      chosen.push({agenda:result.agenda,source:batch.entries[i]});
    }
    if(!chosen.length)return;
    const captured=batch.text,editId=batch.editId;
    try{
      const created=chosen.map(({agenda,source})=>({id:crypto.randomUUID(),transcript:captured,summary:source.source,sourceSpan:{start:source.sourceStart,end:source.sourceEnd},category:'recordatorio',kind:'recordatorio',title:agenda.title,agenda,coins:5,date:new Date().toLocaleDateString('es-ES'),dateISO:new Date().toISOString(),source:'local-agenda-single-v1',viability:'Cita guardada en Casa.',monetization:'Avisos pendientes de confirmar.',reminderAt:agenda.instant||'',reminderLabel:agenda.instant?formatAgendaInstant(agenda.instant):'Sin hora',reminders:agenda.occurrences[0].reminders,status:'guardado'}));
      let savedItem;
      if(editId){
        const existing=ideas.find(item=>item.id===editId);if(!existing)throw Error('No se encuentra la entrada original.');
        Object.assign(existing,{agenda:created[0].agenda,title:created[0].title,reminderAt:created[0].reminderAt,reminderLabel:created[0].reminderLabel,reminders:created[0].reminders});
        savedItem=existing;
      }else{ideas.unshift(...created);savedItem=created[0];}
      saveIdeas();
      let delivery=null;
      if(nativeAlerts()){
        $('batchStatus').textContent='Guardada. Activando avisos en el teléfono…';
        try{delivery=await nativeAlerts().scheduleItem(savedItem,true);}
        catch(error){delivery={ok:false,reason:'schedule-error'};}
        savedItem.agenda.deliveryMode=delivery.ok?(delivery.count?'native-local':'no-future-reminders'):'pending-permission';
        savedItem.monetization=delivery.ok?'Avisos locales programados.':'Avisos pendientes de activar.';
        saveIdeas();
      }
      calendarDate=chosen[0].agenda.date;mode='month';
      if(!editId){$('ideaInput').value='';finalTranscript='';interimTranscript='';closeCaptureText();}
      closeBatch();renderFolders();renderAssistant();showCalendar();
      toast(!nativeAlerts()?'Cita guardada. La prueba web no enviará avisos.':delivery?.ok?(delivery.count?'Cita guardada · avisos activos en el teléfono':'Cita guardada · no quedan avisos futuros'):'Cita guardada · activa los permisos de avisos en Casa');
    }catch(error){$('batchStatus').textContent=error.message;}
  }
  $('batchForm').addEventListener('submit',saveBatch);
  $('batchCards').addEventListener('click',event=>{
    const button=event.target.closest('[data-time-index]');if(button)openTime(Number(button.dataset.timeIndex));
  });
  $('batchCards').addEventListener('input',event=>{
    if(event.target.id.startsWith('bDate'))delete event.target.dataset.weekday;
    if(event.target.dataset.weekIndex===undefined)refreshBatch();
  });
  $('batchCards').addEventListener('change',event=>{
    const control=event.target;
    if(control.dataset.weekIndex!==undefined&&control.value!==''){
      const i=Number(control.dataset.weekIndex),date=$('bDate'+i),f=fields(i);
      date.dataset.weekday=control.value;date.value=C.nextWeekday(Number(control.value),f.allDay?'':f.time);
    }
    refreshBatch();
  });
  $('batchBack').addEventListener('click',closeBatch);
  $('batchCancel').addEventListener('click',async()=>{
    if(!batch?.editId)return;
    const item=ideas.find(entry=>entry.id===batch.editId);if(!item)return;
    try{if(nativeAlerts())await nativeAlerts().cancelItem(item);item.agenda={...item.agenda,status:'cancelled',deliveryMode:'cancelled',cancelledAt:new Date().toISOString(),occurrences:[]};item.reminders=[];item.reminderAt='';item.reminderLabel='';item.status='cancelada';saveIdeas();closeBatch();renderFolders();renderAssistant();showCalendar();toast('Cita cancelada · avisos retirados');}
    catch(error){$('batchStatus').textContent=error.message;}
  });
  $('batchOv').addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();closeBatch();}
    if(event.key==='Tab'){
      const controls=Array.from($('batchForm').querySelectorAll('input,textarea,select,button,summary')).filter(el=>!el.disabled&&el.getClientRects().length);
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  // A dictation prepares one editable appointment. Multiple events are deliberately
  // not guessed or saved in a batch: capturing the next one is clearer and safer.
  window.guardarIdea=async function(){
    if(window.LeteoNativeSpeech?.native)await stopSpeechRecognition(false);
    const text=$('ideaInput').value.trim();
    if(!text){focusInput();return;}
    const parsed=C.parseMany(text);
    if(!window.LeteoNativeSpeech?.native)stopSpeechRecognition(true);
    const entry=parsed.entries[0];
    if(!entry)return;
    openBatch(text,{text,entries:[entry],editId:null});
  };
  window.editAgendaEntry=function(){
    const item=ideas.find(entry=>entry.id===curId);if(!item?.agenda)return;
    closeOv('edOv');closeOv('detOv');
    openBatch(item.transcript,{text:item.transcript,editId:item.id,entries:[{...item.agenda,source:item.summary||item.transcript,sourceStart:0,sourceEnd:item.transcript.length}]});
  };
  function label(date,options){return new Intl.DateTimeFormat('es-ES',{timeZone:'UTC',...options}).format(new Date(date+'T12:00Z'));}
  function dotMarkup(count){
    if(!count)return '';
    return '<span class="cal-dots" aria-hidden="true">'+Array.from({length:Math.min(count,12)},()=>'<i></i>').join('')+(count>12?'<small>+'+(count-12)+'</small>':'')+'</span>';
  }
  function editCalendarItem(id){
    const item=ideas.find(entry=>entry.id===id);if(!item?.agenda)return;
    openBatch(item.transcript,{text:item.transcript,editId:item.id,entries:[{...item.agenda,source:item.summary||item.transcript,sourceStart:0,sourceEnd:item.transcript.length}]});
  }
  function entryMarkup(entry){
    return '<button type="button" class="cal-day-entry" data-item-id="'+html(entry.id)+'"><span class="cal-entry-time">'+html(entry.time||'Sin hora')+'</span><span class="cal-entry-title"><i class="cal-event-dot" aria-hidden="true"></i><strong>'+html(entry.title)+'</strong></span>'+(entry.location?'<span class="cal-entry-location">'+html(entry.location)+'</span>':'')+(entry.recurrence==='weekly'?'<span class="cal-entry-repeat">Cada semana</span>':entry.recurrence==='yearly'?'<span class="cal-entry-repeat">Cada año</span>':'')+'</button>';
  }
  function render(){
    updateAlertControls();
    const dates=mode==='month'?C.month(calendarDate):mode==='week'?C.week(calendarDate):[calendarDate];
    const entries=C.events(ideas,dates[0],dates.at(-1));
    const heading=mode==='day'?label(calendarDate,{day:'numeric',month:'long'}):mode==='week'?label(dates[0],{day:'numeric'})+' – '+label(dates.at(-1),{day:'numeric',month:'long'}):label(calendarDate,{month:'long'});
    $('calHeadingGroup').classList.toggle('cal-month-heading',mode==='month');
    $('calHeading').textContent=heading;
    $('calSubtitle').textContent=mode==='day'?label(calendarDate,{weekday:'long',year:'numeric'}):mode==='week'?'Semana del '+label(dates[0],{day:'numeric'})+' al '+label(dates.at(-1),{day:'numeric',month:'long',year:'numeric'}):label(calendarDate,{year:'numeric'});
    $('calPeriod').textContent=mode==='month'?label(calendarDate,{month:'long',year:'numeric'}):mode==='week'?'Semana':label(calendarDate,{day:'numeric',month:'short'});
    $('calPrevious').setAttribute('aria-label',(mode==='month'?'Mes':mode==='week'?'Semana':'Día')+' anterior');
    $('calNext').setAttribute('aria-label',(mode==='month'?'Mes':mode==='week'?'Semana':'Día')+' siguiente');
    document.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));
    $('calHelp').textContent='';$('calHelp').hidden=true;
    const body=$('calBody');body.className='cal-body cal-'+mode;
    if(mode==='month'){
      body.innerHTML='<div class="cal-weekdays" aria-hidden="true">'+['L','M','X','J','V','S','D'].map(d=>'<span>'+d+'</span>').join('')+'</div><div class="cal-month-grid">'+dates.map(date=>{
        const rows=entries.filter(e=>e.date===date),outside=date.slice(0,7)!==calendarDate.slice(0,7),isToday=date===C.today(new Date().toISOString());
        return '<button type="button" class="cal-cell '+(outside?'cal-outside ':'')+(isToday?'cal-is-today':'')+'" data-date="'+date+'" aria-label="'+html(label(date,{weekday:'long',day:'numeric',month:'long'})+', '+rows.length+(rows.length===1?' cita':' citas'))+'"><span class="cal-date-number">'+Number(date.slice(-2))+'</span>'+dotMarkup(rows.length)+'</button>';
      }).join('')+'</div>';
    }else if(mode==='week'){
      body.innerHTML=dates.map(date=>{const rows=entries.filter(e=>e.date===date);return '<button type="button" class="cal-week-day" data-date="'+date+'" aria-label="'+html(label(date,{weekday:'long',day:'numeric'})+', '+rows.length+' citas')+'"><span class="cal-week-date">'+html(label(date,{weekday:'long',day:'numeric'}))+'</span><span class="cal-week-events">'+(rows.length?rows.map(e=>'<span class="cal-week-event"><i class="cal-event-dot" aria-hidden="true"></i><span class="cal-week-event-copy"><strong>'+html(e.time||'Sin hora')+'</strong> '+html(e.title)+'</span></span>').join(''):'')+'</span></button>';}).join('');
    }else{
      const allDay=entries.filter(e=>!e.time),hours=entries.filter(e=>e.time).map(e=>Number(e.time.slice(0,2))),first=Math.min(9,...hours),last=Math.max(21,...hours);
      body.innerHTML=(allDay.length?'<div class="cal-all-day">'+allDay.map(entryMarkup).join('')+'</div>':'')+Array.from({length:last-first+1},(_,i)=>{
        const hour=first+i,rows=entries.filter(e=>e.time&&Number(e.time.slice(0,2))===hour);
        return '<div class="cal-hour"><span class="cal-hour-label">'+String(hour).padStart(2,'0')+':00</span><div>'+rows.map(entryMarkup).join('')+'</div></div>';
      }).join('')+(!entries.length?'<p class="cal-empty-note">No hay citas para este día.</p>':'');
      const firstEntry=body.querySelector('.cal-day-entry');if(firstEntry)body.scrollTop=Math.max(0,firstEntry.offsetTop-75);
    }
  }
  function showCalendar(){
    stopSpeechRecognition(false);
    document.querySelectorAll('.view').forEach(view=>view.classList.remove('active'));$('vCalendar').classList.add('active');curView='calendar';render();
  }
  window.showLeteoCalendar=function(){mode='month';showCalendar();};
  function move(delta){calendarDate=mode==='month'?C.moveMonth(calendarDate,delta):A.dayAdd(calendarDate,delta*(mode==='week'?7:1));render();}
  function openDate(date){calendarDate=date;mode=mode==='month'?'week':'day';render();}
  $('calPrevious').addEventListener('click',()=>move(-1));$('calNext').addEventListener('click',()=>move(1));
  $('calToday').addEventListener('click',()=>{calendarDate=C.today(new Date().toISOString());render();});
  $('calCapture').addEventListener('click',()=>gv('grabar'));
  document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.mode;render();}));
  let pressTimer=null,pressStart=null,suppressClickUntil=0;
  const clearPress=()=>{clearTimeout(pressTimer);pressTimer=null;pressStart=null;document.querySelectorAll('.cal-pressing').forEach(el=>el.classList.remove('cal-pressing'));};
  $('calBody').addEventListener('pointerdown',event=>{
    const day=event.target.closest('[data-date]');if(!day||event.button>0)return;
    clearPress();pressStart={x:event.clientX,y:event.clientY};day.classList.add('cal-pressing');
    pressTimer=setTimeout(()=>{const date=day.dataset.date;clearPress();suppressClickUntil=Date.now()+800;openDate(date);},520);
  });
  $('calBody').addEventListener('pointermove',event=>{if(pressStart&&Math.hypot(event.clientX-pressStart.x,event.clientY-pressStart.y)>12)clearPress();});
  window.addEventListener('pointerup',clearPress);window.addEventListener('pointercancel',clearPress);
  $('calBody').addEventListener('contextmenu',event=>{if(event.target.closest('[data-date]'))event.preventDefault();});
  $('calBody').addEventListener('click',event=>{
    if(Date.now()<suppressClickUntil){event.preventDefault();return;}
    const day=event.target.closest('[data-date]'),item=event.target.closest('[data-item-id]');
    if(day)openDate(day.dataset.date);
    if(item)editCalendarItem(item.dataset.itemId);
  });
  const distance=touches=>Math.hypot(touches[0].clientX-touches[1].clientX,touches[0].clientY-touches[1].clientY);
  $('calBody').addEventListener('touchstart',event=>{
    if(event.touches.length!==2){pinch=null;return;}
    clearPress();const target=event.target.closest('[data-date]');pinch={distance:distance(event.touches),date:target?.dataset.date||calendarDate,mode};event.preventDefault();
  },{passive:false});
  $('calBody').addEventListener('touchmove',event=>{
    if(!pinch||event.touches.length!==2)return;event.preventDefault();
    const next=C.zoom(pinch.mode,distance(event.touches)/pinch.distance);
    if(next!==mode){calendarDate=pinch.date;mode=next;pinch=null;render();}
  },{passive:false});
  $('calBody').addEventListener('touchend',()=>{pinch=null;});$('calBody').addEventListener('touchcancel',()=>{pinch=null;clearPress();});
  $('calActivateAlerts').addEventListener('click',async()=>{
    const native=nativeAlerts();if(!native)return;
    try{const result=await native.activateAll(ideas);applySyncResult(result);toast(result.ok?'Avisos del teléfono activados.':'Concede los permisos de notificaciones y alarmas para activar los avisos.');}
    catch(error){toast('No se pudieron activar los avisos. Inténtalo de nuevo.');}
  });
  window.addEventListener('load',async()=>{
    const native=nativeAlerts();if(!native)return;
    try{applySyncResult(await native.syncAll(ideas));}catch(error){updateAlertControls();}
  });
  document.addEventListener('visibilitychange',async()=>{
    if(document.visibilityState!=='visible'||!nativeAlerts()||batch)return;
    try{applySyncResult(await nativeAlerts().syncAll(ideas));}catch(error){updateAlertControls();}
  });
  window.addEventListener('storage',event=>{if(event.key===SK&&curView==='calendar'){$('calHelp').textContent='Tus citas han cambiado en otra pestaña. Recarga antes de guardar.';$('calHelp').hidden=false;}});
})();
