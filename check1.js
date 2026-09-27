

const KEY="talatShamaliAccountingV3";
const empty={daily:[],employees:[],payments:[],archive:[],expenses:[],purchases:[],monthlyBills:[]};
let db=loadDb();
let editingEmployeeId=null;
let deferredInstallPrompt=null;
const $=id=>document.getElementById(id);
const LOGIN_CODE='078093233';
const LOGIN_SESSION_KEY='talatShamaliPhoneAccessV1';
function normalizeLoginText(v){
  return String(v??'').replace(/[^0-9]/g,'').trim();
}
function setLoginState(logged){
  localStorage.setItem(LOGIN_SESSION_KEY, logged?'1':'0');
  const screen=$("loginScreen");
  if(screen) screen.style.display=logged?'none':'flex';
}
$('loginForm')?.addEventListener('submit',function(e){
  e.preventDefault();
  const phone=normalizeLoginText($('loginPhone')?.value);
  const ok=phone.length===9 && phone===LOGIN_CODE;
  $('loginError').style.display=ok?'none':'block';
  if(ok){ setLoginState(true); }
});
setLoginState(localStorage.getItem(LOGIN_SESSION_KEY)==='1');
const localDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const money=n=>Number(n||0).toFixed(2)+" JD";
const monthOf=d=>String(d||"").slice(0,7);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function loadDb(){try{const raw=JSON.parse(localStorage.getItem(KEY)||"null")||{};return {daily:Array.isArray(raw.daily)?raw.daily:[],employees:Array.isArray(raw.employees)?raw.employees:[],payments:Array.isArray(raw.payments)?raw.payments:[],archive:Array.isArray(raw.archive)?raw.archive:[],expenses:[],purchases:[],monthlyBills:Array.isArray(raw.monthlyBills)?raw.monthlyBills:[]};}catch(e){return {...empty}}}
db.employees=db.employees.map(e=>({...e,id:e.id??Date.now()+Math.random(),name:String(e.name||''),job:String(e.job||''),salary:Number(e.salary||0),status:e.status||'active'}));
db.daily=db.daily.map(x=>({...x,expenses:Number(x.expenses||0),purchases:Number(x.purchases||0),invoices:Number(x.invoices||0)}));
db.payments=db.payments.map(x=>({...x,id:x.id??Date.now()+Math.random(),type:x.type==='weekly'?'weekly':'daily',date:String(x.date||x.payDate||localDate()),payDate:String(x.payDate||x.date||localDate()),weekStart:x.weekStart?String(x.weekStart):'',weekEnd:x.weekEnd?String(x.weekEnd):'',empId:Number(x.empId),amount:Number(x.amount||0),note:String(x.note||'')}));
db.monthlyBills=db.monthlyBills.map(x=>({...x,id:x.id??Date.now()+Math.random(),month:String(x.month||''),type:String(x.type||'other'),amount:Number(x.amount||0),paid:x.paid!==false,note:String(x.note||'')}));
function save(){localStorage.setItem(KEY,JSON.stringify(db));localStorage.setItem(SYNC_LOCAL_MODIFIED_KEY,new Date().toISOString());queueCloudSave()}
const SYNC_KEY='talatShamaliSyncV1';
const SYNC_LOCAL_MODIFIED_KEY='talatShamaliLocalModifiedV1';
const SYNC_CLOUD_UPDATED_KEY='talatShamaliCloudUpdatedV1';
let cloudTimer=null, syncBusy=false;
function syncConfig(){try{return JSON.parse(localStorage.getItem(SYNC_KEY)||'{}')}catch(e){return {}}}
function saveSyncSettings(){const cfg={url:$("syncUrl").value.trim().replace(/\/$/,''),key:$("syncKey").value.trim(),id:$("syncId").value.trim()};if(!cfg.url||!cfg.key||!cfg.id){alert('أدخل رابط Supabase والمفتاح ورمز المزامنة');return}localStorage.setItem(SYNC_KEY,JSON.stringify(cfg));setSyncStatus('☁️ تم حفظ الإعدادات — جاري تحميل البيانات...');syncNow(false)}
function setSyncStatus(t){if($("syncStatus"))$("syncStatus").textContent=t}
function cloudHeaders(cfg){return {'apikey':cfg.key,'Authorization':'Bearer '+cfg.key,'Content-Type':'application/json','Prefer':'return=representation'}}
function localHasData(){return Object.values(db).some(v=>Array.isArray(v)&&v.length)}
function markCloudUpdated(ts){if(ts)localStorage.setItem(SYNC_CLOUD_UPDATED_KEY,ts)}
async function syncNow(push=false){
 const cfg=syncConfig(); if(!cfg.url||!cfg.key||!cfg.id){setSyncStatus('المزامنة غير مفعلة');return}
 if(syncBusy)return; syncBusy=true;
 try{
  const h=cloudHeaders(cfg);
  if(push){
   const now=new Date().toISOString();
   const r=await fetch(cfg.url+'/rest/v1/cafe_sync',{method:'POST',headers:{...h,'Prefer':'resolution=merge-duplicates,return=representation'},body:JSON.stringify({id:cfg.id,data:db,updated_at:now})});
   if(!r.ok)throw new Error('push');
   markCloudUpdated(now); localStorage.setItem(SYNC_LOCAL_MODIFIED_KEY,now);
   setSyncStatus('☁️ محفوظ ومتزامن — '+new Date(now).toLocaleTimeString('ar-JO'));
  }else{
   const r=await fetch(cfg.url+'/rest/v1/cafe_sync?id=eq.'+encodeURIComponent(cfg.id)+'&select=data,updated_at',{headers:h});
   if(!r.ok)throw new Error('fetch');
   const rows=await r.json();
   if(rows[0]?.data){
    const cloudTs=rows[0].updated_at||'';
    const localTs=localStorage.getItem(SYNC_LOCAL_MODIFIED_KEY)||'';
    const lastCloud=localStorage.getItem(SYNC_CLOUD_UPDATED_KEY)||'';
    // أول تشغيل على جهاز جديد: إذا لم توجد بيانات محلية، نزّل النسخة السحابية فورًا.
    // إذا كانت هناك بيانات محلية أحدث، لا نستبدلها بصمت.
    if(!localHasData() || !localTs || (cloudTs && cloudTs>localTs && cloudTs!==lastCloud)){
      db=normalizeDb(rows[0].data);
      localStorage.setItem(KEY,JSON.stringify(db));
      localStorage.setItem(SYNC_LOCAL_MODIFIED_KEY,cloudTs||new Date().toISOString());
      markCloudUpdated(cloudTs);
      renderAll();
      setSyncStatus('☁️ تم تحميل جميع البيانات من السحابة');
    }else if(cloudTs && cloudTs>localTs && cloudTs===lastCloud){
      setSyncStatus('☁️ البيانات متزامنة');
    }else{
      setSyncStatus('☁️ البيانات المحلية أحدث — لم يتم استبدالها');
    }
   }else setSyncStatus('☁️ لا توجد بيانات سحابية بعد');
  }
 }catch(e){setSyncStatus('⚠️ تعذر الاتصال بالسحابة — سيتم المحاولة تلقائيًا لاحقًا')}
 finally{syncBusy=false}
}
function queueCloudSave(){clearTimeout(cloudTimer);cloudTimer=setTimeout(()=>syncNow(true),500)}
function normalizeDb(raw){
 raw=raw||{};
 const out={
  daily:Array.isArray(raw.daily)?raw.daily:[],
  employees:Array.isArray(raw.employees)?raw.employees:[],
  payments:Array.isArray(raw.payments)?raw.payments:[],
  archive:Array.isArray(raw.archive)?raw.archive:[],
  expenses:[],
  purchases:[],
  monthlyBills:Array.isArray(raw.monthlyBills)?raw.monthlyBills:[]
 };
 out.employees=out.employees.map(e=>({...e,id:e.id??uid(),name:String(e.name||''),job:String(e.job||''),salary:Number(e.salary||0),status:e.status||'active'}));
 out.daily=out.daily.map(x=>({...x,expenses:Number(x.expenses||0),purchases:Number(x.purchases||0),invoices:Number(x.invoices||0),date:String(x.date||'')}));
 out.payments=out.payments.map(x=>({...x,id:x.id??uid(),type:x.type==='weekly'?'weekly':'daily',date:String(x.date||x.payDate||localDate()),payDate:String(x.payDate||x.date||localDate()),empId:Number(x.empId),amount:Number(x.amount||0),note:String(x.note||'')}));
 out.monthlyBills=out.monthlyBills.map(x=>({...x,id:x.id??uid(),month:String(x.month||''),type:String(x.type||'other'),amount:Number(x.amount||0),paid:x.paid!==false,note:String(x.note||'')}));
 return out;
}
function loadSyncSettings(doCloud=false){const c=syncConfig();if($("syncUrl")){$("syncUrl").value=c.url||'';$('syncKey').value=c.key||'';$('syncId').value=c.id||''}if(doCloud&&c.url&&c.key&&c.id)syncNow(false)}
// مزامنة تلقائية: عند فتح الموقع ثم كل 10 ثوانٍ، حتى تظهر فواتير الجهاز الآخر دون إدخالها من جديد.
setInterval(()=>{const c=syncConfig();if(c.url&&c.key&&c.id)syncNow(false)},10000);
function toast(msg){const t=$("toast");t.textContent=msg;t.style.display='block';clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.style.display='none',2200)}
function goToday(id){$(id).value=localDate();if(id==='dDate') loadDailyInputs(localDate())}
function changeDailyDate(delta){const input=$("dDate");const base=new Date((input.value||localDate())+'T00:00:00');base.setDate(base.getDate()+delta);const ds=`${base.getFullYear()}-${String(base.getMonth()+1).padStart(2,'0')}-${String(base.getDate()).padStart(2,'0')}`;input.value=ds;loadDailyInputs(ds)}
function scrollToId(id){$(id)?.scrollIntoView({behavior:'smooth',block:'start'})}
function showPage(id){document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));$(id)?.classList.add('active');document.querySelectorAll('.bottom-nav button').forEach(x=>x.classList.toggle('active',x.dataset.page===id));window.scrollTo({top:0,behavior:'smooth'});renderAll()}
function dailyFor(date){return db.daily.find(x=>x.date===date)||{date,expenses:0,purchases:0,invoices:0}}
function salaryFor(date){return db.payments.filter(x=>x.date===date).reduce((a,x)=>a+Number(x.amount||0),0)}
function netFor(date){const d=dailyFor(date);return Number(d.invoices)-Number(d.expenses)-Number(d.purchases)-salaryFor(date)}
function updateClock(){const now=new Date();const date=new Intl.DateTimeFormat('ar-JO',{weekday:'long',year:'numeric',month:'long',day:'numeric'}).format(now);const time=new Intl.DateTimeFormat('ar-JO',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(now);if($("liveClock"))$("liveClock").textContent=`${date} • ${time}`}
setInterval(updateClock,1000);updateClock();
function renderHomeDateNav(){const d=$("dashDate");if(!d)return}
function loadDailyInputs(date){const d=dailyFor(date);$("dExpInput").value=d.expenses||0;$("dPurInput").value=d.purchases||0;$("dInvInput").value=d.invoices||0;updateDailyPreview()}
function updateDailyPreview(){const date=$("dDate").value||localDate(),exp=Number($("dExpInput").value||0),pur=Number($("dPurInput").value||0),inv=Number($("dInvInput").value||0),pay=salaryFor(date),out=exp+pur,net=inv-out-pay;$("dailySalesPreview").textContent=money(inv);$("dailyOutPreview").textContent=money(out);$("dailyNetPreview").textContent=money(net);$("dailyNetPreview").className='v '+(net>=0?'ok':'danger-text')}
["dDate","dExpInput","dPurInput","dInvInput"].forEach(id=>$(id)?.addEventListener('input',updateDailyPreview));$("dDate")?.addEventListener('change',e=>loadDailyInputs(e.target.value));
$("dailyForm").onsubmit=e=>{e.preventDefault();const date=$("dDate").value;if(!date)return;const obj={date,expenses:Number($("dExpInput").value)||0,purchases:Number($("dPurInput").value)||0,invoices:Number($("dInvInput").value)||0};const old=db.daily.find(x=>x.date===date);if(old)Object.assign(old,obj);else db.daily.push(obj);save();renderAll();toast('تم حفظ جرد اليوم ✓')}
function renderDaily(){const rows=[...db.daily].sort((a,b)=>b.date.localeCompare(a.date)).map(x=>`<tr><td>${esc(x.date)}</td><td>${money(x.invoices)}</td><td>${money(x.expenses)}</td><td>${money(x.purchases)}</td><td>${money(salaryFor(x.date))}</td><td class="${netFor(x.date)>=0?'ok':'warn'}">${money(netFor(x.date))}</td><td><button class="btn danger" onclick="deleteDaily('${esc(x.date)}')">حذف</button></td></tr>`).join('');$("dailyTable").innerHTML=rows?`<table><tr><th>التاريخ</th><th>المبيعات</th><th>المصاريف</th><th>المشتريات</th><th>الرواتب</th><th>الصافي</th><th></th></tr>${rows}</table>`:`<div class="empty">لا توجد أيام مسجلة بعد</div>`}
function safeDeleteConfirm(message){return window.confirm('⚠️ تأكيد الحذف\n\n'+message+'\n\nهذا الإجراء لا يمكن التراجع عنه.')}
function deleteDaily(date){if(safeDeleteConfirm('هل تريد حذف جرد يوم '+date+'؟')){db.daily=db.daily.filter(x=>x.date!==date);save();renderAll();toast('تم حذف الجرد') }}

function renderSalaries(){const active=db.employees.filter(e=>e.status!=='inactive').length,t=salaryTotals();$("empSummary").innerHTML=`<div class="card stat"><div class="icon">👥</div><div class="label">كل الموظفين</div><div class="big">${db.employees.length}</div></div><div class="card stat"><div class="icon">🟢</div><div class="label">النشطون</div><div class="big">${active}</div></div><div class="card stat"><div class="icon">📅</div><div class="label">رواتب هذا الأسبوع</div><div class="big">${money(t.week)}</div></div><div class="card stat"><div class="icon">🗓️</div><div class="label">رواتب هذا الشهر</div><div class="big">${money(t.month)}</div></div><div class="card stat"><div class="icon">📆</div><div class="label">رواتب هذه السنة</div><div class="big">${money(t.year)}</div></div>`;const rows=db.employees.map(e=>`<tr><td><b>${esc(e.name)}</b><div class="muted" style="font-size:9px">${esc(e.job||'بدون وظيفة')}</div></td><td>${money(e.salary)}</td><td>${money(db.payments.filter(p=>Number(p.empId)===Number(e.id)).reduce((a,p)=>a+p.amount,0))}</td><td><span class="badge">${e.status==='inactive'?'غير نشط':'نشط'}</span></td><td><div class="actions"><button class="btn" onclick="editEmployee(${e.id})">تعديل</button><button class="btn danger" onclick="deleteEmployee(${e.id})">حذف</button></div></td></tr>`).join('');$("empTable").innerHTML=rows?`<div class="table-wrap"><table><tr><th>الموظف</th><th>الراتب اليومي</th><th>إجمالي المدفوع</th><th>الحالة</th><th></th></tr>${rows}</table></div>`:`<div class="empty">أضف أول موظف ثم سجّل الراتب اليومي</div>`;renderBulkPay();renderPayTable()}
function renderBulkPay(){const date=$("bulkPayDate").value||localDate();$("weekRange").textContent=`تسجيل رواتب يوم ${date}`;const active=db.employees.filter(e=>e.status!=='inactive');$("bulkPayList").innerHTML=active.length?active.map(e=>{const ex=db.payments.find(p=>p.type==='daily'&&p.date===date&&Number(p.empId)===Number(e.id));const val=ex?ex.amount:Number(e.salary||0);return `<div class="pay-row"><div><div class="pay-name">${esc(e.name)}</div><div class="pay-job">${esc(e.job||'')}</div></div><input class="bulk-amount" data-id="${e.id}" type="number" min="0" step=".01" value="${val}"><div class="check"><input class="bulk-check" type="checkbox" ${ex?'checked':''}> مدفوع</div></div>`}).join(''):`<div class="empty">لا يوجد موظفون نشطون</div>`;const rows=[...document.querySelectorAll('.pay-row')];$("bulkCount").textContent=active.length;$("bulkTotal").textContent=money(rows.reduce((a,r)=>a+Number(r.querySelector('.bulk-amount').value||0),0));$("bulkRecorded").textContent=rows.filter(r=>r.querySelector('.bulk-check').checked).length}document.addEventListener('input',e=>{if(e.target.matches('.bulk-amount,.bulk-check')){const rows=[...document.querySelectorAll('.pay-row')];if($('bulkTotal'))$('bulkTotal').textContent=money(rows.reduce((a,r)=>a+Number(r.querySelector('.bulk-amount')?.value||0),0));if($('bulkRecorded'))$('bulkRecorded').textContent=rows.filter(r=>r.querySelector('.bulk-check')?.checked).length}});
function saveBulkWages(){const date=$("bulkPayDate").value||localDate();let changed=0;document.querySelectorAll('.pay-row').forEach(row=>{const id=Number(row.querySelector('.bulk-amount').dataset.id),checked=row.querySelector('.bulk-check').checked,amount=Number(row.querySelector('.bulk-amount').value)||0;const matches=db.payments.filter(p=>p.type==='daily'&&p.date===date&&Number(p.empId)===id);const existing=matches[0];if(matches.length>1)db.payments=db.payments.filter(p=>!(p.type==='daily'&&p.date===date&&Number(p.empId)===id&&p!==existing));if(checked){if(existing)existing.amount=amount;else db.payments.push({id:Date.now()+Math.random(),type:'daily',date,payDate:date,empId:id,amount,note:'راتب يومي'});changed++}else if(existing){db.payments=db.payments.filter(p=>p!==existing);changed++}});save();renderAll();toast(`تم حفظ الرواتب اليومية لـ ${changed} سجل ✓`)}
function renderPayTable(){const q=($('paySearch')?.value||'').trim().toLowerCase();const from=$('payFrom')?.value||'';const to=$('payTo')?.value||'';const view=$('payView')?.value||'all';let list=[...db.payments].filter(x=>{const d=x.date||x.payDate||'';const e=db.employees.find(e=>Number(e.id)===Number(x.empId));return (!q||(e?.name||'محذوف').toLowerCase().includes(q))&&(!from||d>=from)&&(!to||d<=to)&&(view==='all'||x.type==='daily')});list.sort((a,b)=>(b.date||b.payDate||'').localeCompare(a.date||a.payDate||'')||Number(b.id)-Number(a.id));$('payLogCount').textContent=list.length;$('payLogTotal').textContent=money(list.reduce((a,x)=>a+Number(x.amount||0),0));const rows=list.map(x=>{const e=db.employees.find(e=>Number(e.id)===Number(x.empId));return `<tr><td><b>${esc(x.date||x.payDate||'-')}</b></td><td>${esc(e?.name||'موظف محذوف')}<div class="muted" style="font-size:9px">${esc(e?.job||'')}</div></td><td><b>${money(x.amount)}</b></td><td>${esc(x.note||'راتب يومي')}</td><td><div class="actions"><button class="btn" onclick="editPayment(${x.id})">✏️ تعديل</button><button class="btn danger" onclick="deletePayment(${x.id})">🗑️ حذف</button></div></td></tr>`}).join('');$('payTable').innerHTML=rows?`<table><tr><th>التاريخ</th><th>الموظف</th><th>المبلغ</th><th>ملاحظة</th><th>إجراء</th></tr>${rows}</table>`:`<div class="empty">لا توجد رواتب مطابقة للبحث.</div>`}

function totalsForMonth(m){const d=db.daily.filter(x=>monthOf(x.date)===m);return {expenses:d.reduce((a,x)=>a+Number(x.expenses||0),0),purchases:d.reduce((a,x)=>a+Number(x.purchases||0),0)}}
function yearData(y){const ms=String(y);let invoices=0,expenses=0,purchases=0,salaries=0;db.daily.filter(x=>String(x.date).startsWith(ms+'-')).forEach(x=>{invoices+=Number(x.invoices||0);expenses+=Number(x.expenses||0);purchases+=Number(x.purchases||0)});salaries=db.payments.filter(x=>String(x.date).startsWith(ms+'-')).reduce((a,x)=>a+Number(x.amount||0),0);const bills=db.monthlyBills.filter(x=>x.month.startsWith(ms+'-')).reduce((a,x)=>a+Number(x.amount||0),0);expenses+=bills;const profit=invoices-expenses-purchases-salaries;const without=-expenses-purchases-salaries;const cost=expenses+purchases+salaries;return {invoices,expenses,purchases,salaries,profit,without,margin:invoices?profit/invoices*100:0,marginWithout:cost?without/cost*100:0}}
function renderAnnual(){const y=Number($('yearPick').value)||new Date().getFullYear(),x=yearData(y);$('annualBox').innerHTML=`<div class="hero"><div class="hero-title">Total ${y} — صافي النتيجة</div><div class="hero-value ${x.profit>=0?'ok':'danger-text'}">${money(x.profit)}</div><div class="hero-note">هامش الربح: ${x.margin.toFixed(2)}%</div></div><div class="grid"><div class="card stat"><div class="label">إجمالي المبيعات</div><div class="big">${money(x.invoices)}</div></div><div class="card stat"><div class="label">المصاريف</div><div class="big">${money(x.expenses)}</div></div><div class="card stat"><div class="label">المشتريات</div><div class="big">${money(x.purchases)}</div></div><div class="card stat"><div class="label">الأجور</div><div class="big">${money(x.salaries)}</div></div><div class="card stat"><div class="label">صافي النتيجة</div><div class="big ${x.profit>=0?'ok':'warn'}">${money(x.profit)}</div></div><div class="card stat"><div class="label">صافي النتيجة</div><div class="big warn">${money(x.without)}</div><div class="muted" style="font-size:9px;margin-top:4px">هامش بدون الفواتير: ${x.marginWithout.toFixed(2)}%</div></div></div>`}
function autoArchiveCompletedMonths(){const now=new Date();const current=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;const months=[...new Set(db.daily.map(x=>monthOf(x.date)).filter(Boolean))];let changed=false;for(const m of months){if(m===current)continue;const [yy,mm]=m.split('-').map(Number);const daysInMonth=new Date(yy,mm,0).getDate();const dates=new Set(db.daily.filter(x=>monthOf(x.date)===m).map(x=>x.date));let complete=true;for(let day=1;day<=daysInMonth;day++){const ds=`${yy}-${String(mm).padStart(2,'0')}-${String(day).padStart(2,'0')}`;if(!dates.has(ds)){complete=false;break}}if(complete&&!db.archive.some(a=>a.month===m)){const md=monthData(m);db.archive.push(md);changed=true}}if(changed)localStorage.setItem(KEY,JSON.stringify(db))}
function monthData(m){const days=db.daily.filter(x=>monthOf(x.date)===m);const invoices=days.reduce((a,x)=>a+Number(x.invoices||0),0),expenses=days.reduce((a,x)=>a+Number(x.expenses||0),0)+monthlyBillsTotal(m),purchases=days.reduce((a,x)=>a+Number(x.purchases||0),0),salaries=db.payments.filter(x=>monthOf(x.date)===m).reduce((a,x)=>a+Number(x.amount||0),0);return {month:m,invoices,expenses,purchases,salaries,profitWithInvoices:invoices-expenses-purchases-salaries,profitWithoutInvoices:-expenses-purchases-salaries,days:days.length}}
function renderMonth(){const m=$("monthPick").value||localDate().slice(0,7),x=monthData(m);$("monthBox").innerHTML=`<div class="hero"><div class="hero-title">صافي ربح ${esc(m)}</div><div class="hero-value ${x.profitWithInvoices>=0?'ok':'danger-text'}">${money(x.profitWithInvoices)}</div><div class="hero-note">الفواتير − المصاريف − المشتريات − الأجور</div></div><div class="grid"><div class="card stat"><div class="icon">📅</div><div class="label">أيام مسجلة</div><div class="big">${x.days}</div></div><div class="card stat"><div class="icon">💵</div><div class="label">المبيعات</div><div class="big">${money(x.invoices)}</div></div><div class="card stat"><div class="icon">💸</div><div class="label">المصاريف</div><div class="big">${money(x.expenses)}</div></div><div class="card stat"><div class="icon">🛒</div><div class="label">المشتريات</div><div class="big">${money(x.purchases)}</div></div><div class="card stat"><div class="icon">👥</div><div class="label">الأجور</div><div class="big">${money(x.salaries)}</div></div><div class="card stat"><div class="icon">📈</div><div class="label">الربح بدون الفواتير</div><div class="big warn">${money(x.profitWithoutInvoices)}</div></div></div>`;renderMonthChart()}
function renderMonthChart(){const arr=[];const base=new Date();base.setDate(1);for(let i=5;i>=0;i--){const d=new Date(base.getFullYear(),base.getMonth()-i,1);const m=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;arr.push(monthData(m))}const max=Math.max(1,...arr.map(x=>Math.abs(x.profitWithInvoices)));$("monthChart").innerHTML=arr.map(x=>{const h=Math.max(3,Math.round(Math.abs(x.profitWithInvoices)/max*92));return `<div class="bar-col"><div class="bar-val">${x.profitWithInvoices.toFixed(0)}</div><div class="bar" style="height:${h}px;opacity:${x.profitWithInvoices<0?.55:1}"></div><div class="bar-label">${x.month.slice(5)}</div></div>`}).join('')}
function archiveCurrentMonth(){const m=$("monthPick").value||localDate().slice(0,7),x=monthData(m),old=db.archive.find(a=>a.month===m);if(old)Object.assign(old,x);else db.archive.push(x);save();renderAll();toast('تمت أرشفة الشهر ✓')}
function renderArchive(){const rows=[...db.archive].sort((a,b)=>b.month.localeCompare(a.month)).map(x=>`<tr><td>${esc(x.month)}</td><td>${money(x.invoices)}</td><td>${money(x.expenses)}</td><td>${money(x.purchases)}</td><td>${money(x.salaries)}</td><td class="${x.profitWithInvoices>=0?'ok':'warn'}">${money(x.profitWithInvoices)}</td><td><button class="btn" onclick="viewArchive('${esc(x.month)}')">فتح</button><button class="btn danger" onclick="deleteArchive('${esc(x.month)}')">حذف</button></td></tr>`).join('');$("archiveTable").innerHTML=rows?`<table><tr><th>الشهر</th><th>المبيعات</th><th>المصاريف</th><th>المشتريات</th><th>الأجور</th><th>الربح</th><th></th></tr>${rows}</table>`:`<div class="empty">لا يوجد أرشيف بعد</div>`}

function renderDailyArchive(){const rows=[...db.daily].sort((a,b)=>b.date.localeCompare(a.date)).map(x=>`<tr><td>${esc(x.date)}</td><td>${money(x.invoices)}</td><td>${money(x.expenses)}</td><td>${money(x.purchases)}</td><td>${money(salaryFor(x.date))}</td><td class="${netFor(x.date)>=0?'ok':'warn'}">${money(netFor(x.date))}</td><td><button class="btn" onclick="openDayArchive('${esc(x.date)}')">فتح</button></td></tr>`).join('');$('dailyArchiveTable').innerHTML=rows?`<table><tr><th>التاريخ</th><th>المبيعات</th><th>المصاريف</th><th>المشتريات</th><th>الرواتب</th><th>صافي اليوم</th><th></th></tr>${rows}</table>`:`<div class="empty">لا يوجد أرشيف يومي بعد</div>`}function openDayArchive(date){const d=dailyFor(date),s=salaryFor(date);alert(`تفاصيل ${date}\nالمبيعات: ${money(d.invoices)}\nالمصاريف: ${money(d.expenses)}\nالمشتريات: ${money(d.purchases)}\nالرواتب: ${money(s)}\nصافي اليوم: ${money(d.invoices-d.expenses-d.purchases-s)}`)}
function deleteArchive(m){if(safeDeleteConfirm('هل تريد حذف أرشيف هذا الشهر؟')){db.archive=db.archive.filter(x=>x.month!==m);save();renderAll();toast('تم الحذف')}}

function billLabel(t){return t==='water'?'تنكات مياه':t==='electricity'?'كهرباء':t==='rent'?'إيجار محل':'أخرى'}
function monthlyBillsFor(m){return db.monthlyBills.filter(x=>x.month===m)}
function monthlyBillsTotal(m){return monthlyBillsFor(m).reduce((a,x)=>a+Number(x.amount||0),0)}
function renderBills(){const m=$('billMonth')?.value||localDate().slice(0,7);const arr=[...db.monthlyBills].sort((a,b)=>b.month.localeCompare(a.month)||b.id-a.id);const total=arr.filter(x=>x.month===m).reduce((a,x)=>a+Number(x.amount||0),0);$('billSummary').innerHTML=`<div class="card stat"><div class="label">تنكات مياه</div><div class="big">${money(arr.filter(x=>x.month===m&&x.type==='water').reduce((a,x)=>a+x.amount,0))}</div></div><div class="card stat"><div class="label">كهرباء</div><div class="big">${money(arr.filter(x=>x.month===m&&x.type==='electricity').reduce((a,x)=>a+x.amount,0))}</div></div><div class="card stat"><div class="label">إيجار المحل</div><div class="big">${money(arr.filter(x=>x.month===m&&x.type==='rent').reduce((a,x)=>a+x.amount,0))}</div></div><div class="card stat"><div class="label">إجمالي فواتير الشهر</div><div class="big">${money(total)}</div></div>`;$('billTable').innerHTML=arr.length?`<table><tr><th>الشهر</th><th>الفاتورة</th><th>المبلغ</th><th>الحالة</th><th>ملاحظة</th><th></th></tr>${arr.map(x=>`<tr><td>${esc(x.month)}</td><td>${billLabel(x.type)}</td><td>${money(x.amount)}</td><td>${x.paid?'مدفوعة':'غير مدفوعة'}</td><td>${esc(x.note||'-')}</td><td><button class="btn danger" onclick="deleteBill(${x.id})">حذف</button></td></tr>`).join('')}</table>`:`<div class="empty">لا توجد فواتير شهرية بعد</div>`}
$('billForm').onsubmit=e=>{e.preventDefault();db.monthlyBills.push({id:Date.now()+Math.random(),month:$('billMonth').value,type:$('billType').value,amount:Number($('billAmount').value)||0,paid:$('billPaid').value==='true',note:$('billNote').value.trim()});save();e.target.reset();$('billMonth').value=localDate().slice(0,7);renderAll();toast('تم حفظ الفاتورة الشهرية ✓')};function deleteBill(id){if(safeDeleteConfirm('هل تريد حذف هذه الفاتورة الشهرية؟')){db.monthlyBills=db.monthlyBills.filter(x=>x.id!==id);save();renderAll()}}
function salaryTotals(){const now=new Date(),m=localDate().slice(0,7),y=String(now.getFullYear());return {week:db.payments.filter(x=>{const d=x.date||x.payDate;return d>=weekStart(localDate())&&d<=weekEnd(localDate())}).reduce((a,x)=>a+x.amount,0),month:db.payments.filter(x=>monthOf(x.date||x.payDate)===m).reduce((a,x)=>a+x.amount,0),year:db.payments.filter(x=>String(x.date||x.payDate).startsWith(y+'-')).reduce((a,x)=>a+x.amount,0)}}

/* ===== إصلاحات v19 ===== */
function uid(){return Date.now()+Math.random()}

function weekStart(dateStr){
  const d=new Date((dateStr||localDate())+'T00:00:00');
  const day=d.getDay(); // Sunday=0, Monday=1
  const diff=(day===0?-6:1-day);
  d.setDate(d.getDate()+diff);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function weekEnd(dateStr){
  const d=new Date((weekStart(dateStr))+'T00:00:00');
  d.setDate(d.getDate()+6);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function editEmployee(id){
  const e=db.employees.find(x=>Number(x.id)===Number(id));
  if(!e)return;
  editingEmployeeId=e.id;
  $('empName').value=e.name||'';
  $('empJob').value=e.job||'';
  $('empSalary').value=Number(e.salary||0);
  $('empStatus').value=e.status||'active';
  $('empSubmit').textContent='💾 حفظ التعديل';
  $('empCancel').style.display='inline-flex';
  $('empName').focus();
  scrollToId('empForm');
}
function cancelEmployeeEdit(){
  editingEmployeeId=null;
  $('empForm')?.reset();
  $('empSalary').value=0;
  $('empStatus').value='active';
  $('empSubmit').textContent='➕ إضافة موظف';
  $('empCancel').style.display='none';
}
function deleteEmployee(id){
  const e=db.employees.find(x=>Number(x.id)===Number(id));
  if(!e)return;
  if(!safeDeleteConfirm(`هل تريد حذف الموظف "${e.name}"؟ سيتم الإبقاء على سجلات الرواتب السابقة.`))return;
  db.employees=db.employees.filter(x=>Number(x.id)!==Number(id));
  save(); renderAll(); toast('تم حذف الموظف');
}
let editingPaymentId=null;
function populatePaymentEmployees(selected){const sel=$("paymentEmp");if(!sel)return;const list=[...db.employees].sort((a,b)=>String(a.name).localeCompare(String(b.name),'ar'));sel.innerHTML=list.length?list.map(e=>`<option value="${e.id}" ${Number(e.id)===Number(selected)?'selected':''}>${esc(e.name)}${e.job?' — '+esc(e.job):''}</option>`).join(''):'<option value="">لا يوجد موظفون</option>';}
function startNewPayment(){editingPaymentId=null;populatePaymentEmployees(db.employees.find(e=>e.status!=='inactive')?.id);$("paymentEditorTitle").textContent='➕ إضافة راتب';$("paymentDate").value=$("bulkPayDate").value||localDate();const emp=db.employees.find(e=>Number(e.id)===Number($("paymentEmp")?.value));$("paymentAmount").value=emp?.salary||0;$("paymentNote").value='';$("paymentEditor").style.display='block';scrollToId('paymentEditor');}
function editPayment(id){const p=db.payments.find(x=>Number(x.id)===Number(id));if(!p)return;editingPaymentId=p.id;populatePaymentEmployees(p.empId);$("paymentEditorTitle").textContent='✏️ تعديل الراتب';$("paymentDate").value=p.date||p.payDate||localDate();$("paymentAmount").value=Number(p.amount||0);$("paymentNote").value=p.note||'';$("paymentEditor").style.display='block';scrollToId('paymentEditor');}
function cancelPaymentEdit(){editingPaymentId=null;$("paymentEditor").style.display='none';$("paymentForm")?.reset();}
function setupPaymentForm(){const f=$("paymentForm");if(!f||f.dataset.ready==='1')return;f.dataset.ready='1';f.addEventListener('submit',e=>{e.preventDefault();const empId=Number($("paymentEmp").value);const date=$("paymentDate").value;const amount=Number($("paymentAmount").value);const note=$("paymentNote").value.trim();if(!empId||!date){toast('اختر الموظف والتاريخ');return}if(!Number.isFinite(amount)||amount<0){toast('المبلغ غير صحيح');return}if(editingPaymentId!==null){const p=db.payments.find(x=>Number(x.id)===Number(editingPaymentId));if(!p)return;const dup=db.payments.find(x=>x!==p&&x.type==='daily'&&x.date===date&&Number(x.empId)===empId);if(dup){dup.amount=amount;dup.payDate=date;dup.note=note||dup.note||'راتب يومي';db.payments=db.payments.filter(x=>x!==p);toast('يوجد راتب لنفس الموظف في نفس اليوم، تم دمج التعديل معه ✓')}else{p.empId=empId;p.date=date;p.payDate=date;p.amount=amount;p.note=note||'راتب يومي';toast('تم تعديل الراتب ✓')}}else{const dup=db.payments.find(x=>x.type==='daily'&&x.date===date&&Number(x.empId)===empId);if(dup){dup.amount=amount;dup.payDate=date;dup.note=note||dup.note||'راتب يومي';toast('يوجد راتب لهذا الموظف في نفس اليوم، تم تحديثه ✓')}else{db.payments.push({id:uid(),type:'daily',date,payDate:date,empId,amount,note:note||'راتب يومي'});toast('تمت إضافة الراتب ✓')}}save();cancelPaymentEdit();renderAll();});}
function deletePayment(id){const p=db.payments.find(x=>Number(x.id)===Number(id));if(!p)return;const e=db.employees.find(x=>Number(x.id)===Number(p.empId));if(!safeDeleteConfirm(`حذف راتب ${e?.name||'الموظف'} بتاريخ ${p.date||p.payDate}؟`))return;db.payments=db.payments.filter(x=>Number(x.id)!==Number(id));save();renderAll();toast('تم حذف الراتب ✓');}

function setupEmployeeForm(){
  const form=$('empForm');
  if(!form || form.dataset.ready==='1')return;
  form.dataset.ready='1';
  form.addEventListener('submit',e=>{
    e.preventDefault();
    const name=$('empName').value.trim();
    if(!name){toast('اكتب اسم الموظف أولًا');$('empName').focus();return}
    const job=$('empJob').value.trim();
    const salary=Math.max(0,Number($('empSalary').value)||0);
    const status=$('empStatus').value==='inactive'?'inactive':'active';
    if(editingEmployeeId!==null){
      const employee=db.employees.find(x=>Number(x.id)===Number(editingEmployeeId));
      if(employee) Object.assign(employee,{name,job,salary,status});
      toast('تم تعديل بيانات الموظف ✓');
    }else{
      db.employees.push({id:uid(),name,job,salary,status});
      toast('تمت إضافة الموظف ✓');
    }
    save(); cancelEmployeeEdit(); renderAll();
  });
  $('empCancel')?.addEventListener('click',cancelEmployeeEdit);
}

function exportBackup(){
  const payload={app:'كافيه طلة الشمالي',version:'v22',exportedAt:new Date().toISOString(),data:db};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=`talat-shamali-backup-${localDate()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  toast('تم تصدير النسخة الاحتياطية ✓');
}
function exportExcel(){
  if(typeof XLSX==='undefined'){toast('تعذر تحميل Excel — تحقق من اتصال الإنترنت');return}
  const wb=XLSX.utils.book_new();
  const add=(name,rows)=>{
    const ws=XLSX.utils.json_to_sheet(rows.length?rows:[{}]);
    XLSX.utils.book_append_sheet(wb,ws,name.slice(0,31));
  };
  add('الجرد اليومي',db.daily.map(x=>({التاريخ:x.date,المبيعات:x.invoices,المصاريف:x.expenses,المشتريات:x.purchases,الرواتب:salaryFor(x.date),الصافي:netFor(x.date)})));
  add('الموظفون',db.employees.map(x=>({الاسم:x.name,الوظيفة:x.job,الراتب_اليومي:x.salary,الحالة:x.status})));
  add('الرواتب',db.payments.map(x=>({التاريخ:x.date,الموظف:(db.employees.find(e=>Number(e.id)===Number(x.empId))||{}).name||'محذوف',المبلغ:x.amount,ملاحظة:x.note||''})));
  add('الفواتير_الشهرية',db.monthlyBills.map(x=>({الشهر:x.month,النوع:billLabel(x.type),المبلغ:x.amount,الحالة:x.paid?'مدفوعة':'غير مدفوعة',ملاحظة:x.note||''})));
  add('الأرشيف',db.archive.map(x=>({الشهر:x.month,المبيعات:x.invoices,المصاريف:x.expenses,المشتريات:x.purchases,الرواتب:x.salaries,الربح:x.profitWithInvoices})));
  XLSX.writeFile(wb,`talat-shamali-report-${localDate()}.xlsx`);
  toast('تم تصدير تقرير Excel ✓');
}
function resetAll(){
  if(!safeDeleteConfirm('سيتم حذف كل بيانات الجرد والموظفين والرواتب والأرشيف والفواتير الشهرية من هذا الجهاز.'))return;
  db=JSON.parse(JSON.stringify(empty));
  localStorage.removeItem(SYNC_LOCAL_MODIFIED_KEY);
  localStorage.removeItem(SYNC_CLOUD_UPDATED_KEY);
  save(); cancelEmployeeEdit(); renderAll(); toast('تم مسح البيانات');
}
function viewArchive(month){
  const x=db.archive.find(a=>a.month===month);
  if(!x)return;
  alert(`أرشيف ${month}\n\nالمبيعات: ${money(x.invoices)}\nالمصاريف: ${money(x.expenses)}\nالمشتريات: ${money(x.purchases)}\nالرواتب: ${money(x.salaries)}\nالربح مع المبيعات: ${money(x.profitWithInvoices)}\nالربح بدون المبيعات: ${money(x.profitWithoutInvoices)}`);
}

async function installApp(){
  if(deferredInstallPrompt){
    try{deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice}catch(e){}
    deferredInstallPrompt=null;
    $('installAppBtn')?.setAttribute('hidden','');
    return;
  }
  if(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone){
    toast('التطبيق مثبت بالفعل');
    return;
  }
  toast('من قائمة المتصفح اختر "تثبيت التطبيق" أو "إضافة إلى الشاشة الرئيسية"');
}

window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault(); deferredInstallPrompt=e;
  $('installAppBtn')?.removeAttribute('hidden');
});
window.addEventListener('appinstalled',()=>{
  deferredInstallPrompt=null; $('installAppBtn')?.setAttribute('hidden',''); toast('تم تثبيت التطبيق ✓');
});

function renderHome(){
  const date=$('dashDate').value||localDate();
  const d=dailyFor(date), salary=salaryFor(date);
  const net=netFor(date);
  $('homeHero').innerHTML=`<div class="hero"><div class="hero-title">نتيجة ${esc(date)}</div><div class="hero-value ${net>=0?'ok':'danger-text'}">${money(net)}</div><div class="hero-note">المبيعات − المصاريف − المشتريات − الرواتب</div></div>`;
  const m=monthData(date.slice(0,7));
  $('homeStats').innerHTML=[
    ['💵','مبيعات اليوم',money(d.invoices)],
    ['💸','مصاريف اليوم',money(d.expenses)],
    ['🛒','مشتريات اليوم',money(d.purchases)],
    ['👥','رواتب اليوم',money(salary)],
    ['📊','ربح الشهر',money(m.profitWithInvoices)]
  ].map(x=>`<div class="card stat"><div class="icon">${x[0]}</div><div class="label">${x[1]}</div><div class="big">${x[2]}</div></div>`).join('');
  const base=new Date((date)+'T00:00:00');
  const arr=[];
  for(let i=6;i>=0;i--){
    const dd=new Date(base);dd.setDate(base.getDate()-i);
    const ds=`${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}-${String(dd.getDate()).padStart(2,'0')}`;
    arr.push({date:ds,net:netFor(ds)});
  }
  const max=Math.max(1,...arr.map(x=>Math.abs(x.net)));
  $('weekChart').innerHTML=arr.map(x=>`<div class="bar-col"><div class="bar-val">${x.net.toFixed(0)}</div><div class="bar" style="height:${Math.max(4,Math.round(Math.abs(x.net)/max*92))}px;opacity:${x.net<0?.55:1}"></div><div class="bar-label">${x.date.slice(5)}</div></div>`).join('');
  const active=db.employees.filter(e=>e.status!=='inactive');
  $('todayEmployees').innerHTML=active.length?`<div class="card"><div class="section-title"><h3 style="margin:0">رواتب ${esc(date)}</h3><span class="muted">${money(salary)}</span></div>${active.map(e=>{const p=db.payments.find(p=>p.type==='daily'&&p.date===date&&Number(p.empId)===Number(e.id));return `<div class="pay-row"><div><b>${esc(e.name)}</b><div class="muted">${esc(e.job||'')}</div></div><div>${p?money(p.amount):'<span class="muted">غير مسجل</span>'}</div></div>`}).join('')}</div>`:'';
}
function renderAll(){
  setupEmployeeForm();
  setupPaymentForm();
  populatePaymentEmployees($("paymentEmp")?.value);
  $('dashDate').value=$('dashDate').value||localDate();
  $('dDate').value=$('dDate').value||localDate();
  $('bulkPayDate').value=$('bulkPayDate').value||localDate();
  $('monthPick').value=$('monthPick').value||localDate().slice(0,7);
  $('billMonth').value=$('billMonth').value||localDate().slice(0,7);
  $('yearPick').value=$('yearPick').value||new Date().getFullYear();
  renderHome();
  renderDaily();
  renderSalaries();
  renderMonth();
  renderAnnual();
  renderArchive();
  renderDailyArchive();
  renderBills();
  loadSyncSettings(false);
}

$('dashDate')?.addEventListener('change',renderHome);
$('bulkPayDate')?.addEventListener('change',renderBulkPay);
$('paySearch')?.addEventListener('input',renderPayTable);
$('payFrom')?.addEventListener('change',renderPayTable);
$('payTo')?.addEventListener('change',renderPayTable);
$('payView')?.addEventListener('change',renderPayTable);
$('paymentEmp')?.addEventListener('change',()=>{if(editingPaymentId===null){const e=db.employees.find(e=>Number(e.id)===Number($('paymentEmp').value));$('paymentAmount').value=e?.salary||0}});
$('importFile')?.addEventListener('change',async e=>{
  const file=e.target.files?.[0]; if(!file)return;
  try{
    const raw=JSON.parse(await file.text());
    const imported=raw?.data||raw;
    const normalized=normalizeDb(imported);
    if(!safeDeleteConfirm('سيتم استبدال البيانات الحالية بالنسخة الاحتياطية.')){e.target.value='';return}
    db=normalized;
    localStorage.setItem(KEY,JSON.stringify(db));
    localStorage.setItem(SYNC_LOCAL_MODIFIED_KEY,new Date().toISOString());
    renderAll(); toast('تم استيراد النسخة الاحتياطية ✓');
  }catch(err){toast('ملف النسخة الاحتياطية غير صالح')}
  e.target.value='';
});

function renderCustomReport(){const f=$('rangeFrom').value,t=$('rangeTo').value;if(!f||!t)return;let sales=0,exp=0,pur=0,sal=0;db.daily.filter(x=>x.date>=f&&x.date<=t).forEach(x=>{sales+=Number(x.invoices||0);exp+=Number(x.expenses||0);pur+=Number(x.purchases||0)});sal=db.payments.filter(x=>(x.date||x.payDate)>=f&&(x.date||x.payDate)<=t).reduce((a,x)=>a+Number(x.amount||0),0);const bills=db.monthlyBills.filter(x=>x.month>=f.slice(0,7)&&x.month<=t.slice(0,7)).reduce((a,x)=>a+Number(x.amount||0),0);exp+=bills;const profit=sales-exp-pur-sal;$('customReport').innerHTML=`<div class="grid"><div class="card stat"><div class="label">المبيعات</div><div class="big">${money(sales)}</div></div><div class="card stat"><div class="label">المصاريف + الفواتير الشهرية</div><div class="big">${money(exp)}</div></div><div class="card stat"><div class="label">المشتريات</div><div class="big">${money(pur)}</div></div><div class="card stat"><div class="label">الرواتب</div><div class="big">${money(sal)}</div></div><div class="card stat"><div class="label">صافي النتيجة</div><div class="big ${profit>=0?'ok':'warn'}">${money(profit)}</div></div></div>`}


// بدء التطبيق بعد تحميل جميع الوظائف
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>renderAll()); else renderAll();

