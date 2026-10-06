import React, { useState } from 'react';
import {createRoot} from 'react-dom/client';
import {EditMode} from '../src/components/EditMode';
import '../src/index.css';
const n=3000;
const mode = new URLSearchParams(location.search).get('mode') || 'same';
const initial: any = {id:'browser-test',commentaryTitle:'בדיקה',commentaryFileName:'test.txt',lastModifiedTimestamp:0,
  config:{sourceCategory:'shas',targetBookName:'ברכות',ignoreShamInShas:true,diburHamatchilDelimiter:'.'},
  commentaryLines:Array.from({length:n},(_,i)=>mode==='pending'&&i>0?'בא"ד המשך הדברים '+(i+1):'אמר רבי אבא דברי התורה בפירוש מספר '+(i+1)),
  sourceLines:Array.from({length:n},()=> 'אמר רבי אבא דברי התורה'),
  links:(mode==='pending'||mode==='unlinked')?[]:Array.from({length:n},(_,i)=>({line_index_1:i+1,line_index_2:mode==='same'?1:i+1,heRef_2:'x',path_2:'ברכות.txt',connection_type:'commentary',dhText:'אמר רבי אבא',confidence:100,status:'approved'})),dhHighlights:{}};
function App(){const [session,setSession]=useState(initial);return <EditMode session={session} onUpdateSession={setSession}/>}
createRoot(document.getElementById('root')!).render(<App/>);
