import React, { useState, useEffect, useContext, useMemo } from "react";
import { AuthContext } from "../AuthContext.jsx";
import { db } from "../firebaseConfig";
import { useLocation, useNavigate } from "react-router-dom";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";
import Select from "react-select";
import ela8 from "../data/standards/ela8.json";

export default function DailyPlan() {
  const { user } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();

  // Extract ?date=MM.DD.YYYY from URL
  const paramDate = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("date");
  }, [location.search]);

  // Initialize currentDate from URL param if present
  const [currentDate, setCurrentDate] = useState(() => {
    if (paramDate) {
      const [m, d, y] = paramDate.split(".");
      return new Date(Number(y), Number(m) - 1, Number(d));
    }
    return new Date();
  });

  const [today, setToday] = useState("");
  const [weekday, setWeekday] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [planId, setPlanId] = useState(null);
  const [plan, setPlan] = useState(null);

  // Form state
  const [title, setTitle] = useState("");
  const [standards, setStandards] = useState([]);
  const [objective, setObjective] = useState("");
  const [prepSteps, setPrepSteps] = useState([""]);
  const [seqSteps, setSeqSteps] = useState([""]);
  const [prepDone, setPrepDone] = useState([]);
  const [seqDone, setSeqDone] = useState([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Dropdown options for standards
  const standardOptions = ela8.map((s) => ({ value: s.code, label: `${s.code}: ${s.text}` }));

  // Format today's display when currentDate changes
  useEffect(() => {
    const d = currentDate;
    setToday(
      d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
    );
    setWeekday(
      d.toLocaleDateString(undefined, { weekday: "long" })
    );
  }, [currentDate]);

  // Sync URL when currentDate changes
  useEffect(() => {
    const month = String(currentDate.getMonth() + 1).padStart(2, "0");
    const day = String(currentDate.getDate()).padStart(2, "0");
    const year = currentDate.getFullYear();
    const param = `${month}.${day}.${year}`;
    navigate(`?date=${param}`, { replace: true });
  }, [currentDate, navigate]);

  // Load or initialize plan
  useEffect(() => {
    if (!user || !today) return;
    setLoading(true);
    (async () => {
      const ref = collection(db, "teachers", user.uid, "dailyPlans");
      const q = query(ref, where("date", "==", today), orderBy("createdAt", "desc"), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docSnap = snap.docs[0];
        const data = docSnap.data();
        setPlanId(docSnap.id);
        setPlan(data);
        setTitle(data.title || "");
        setStandards(data.standards || []);
        setObjective(data.objective || "");
        const prep = Array.isArray(data.prepSteps) ? data.prepSteps : [""];
        const seq = Array.isArray(data.seqSteps) ? data.seqSteps : [""];
        setPrepSteps(prep);
        setSeqSteps(seq);
        setPrepDone(Array.isArray(data.prepDone) ? data.prepDone : prep.map(() => false));
        setSeqDone(Array.isArray(data.seqDone) ? data.seqDone : seq.map(() => false));
        setIsEditing(false);
      } else {
        setPlanId(null);
        setPlan(null);
        setTitle(""); setStandards([]); setObjective("");
        setPrepSteps([""]); setSeqSteps([""]);
        setPrepDone([]); setSeqDone([]);
        setIsEditing(true);
      }
      setLoading(false);
    })();
  }, [user, today]);

  // When URL param changes, update currentDate
  useEffect(() => {
    if (paramDate) {
      const [m, d, y] = paramDate.split(".");
      setCurrentDate(new Date(Number(y), Number(m) - 1, Number(d)));
    }
  }, [paramDate]);

  const changeDate = (offset) => {
    let d = new Date(currentDate);
    do { d.setDate(d.getDate() + offset); } while ([0,6].includes(d.getDay()));
    setCurrentDate(d);
  };

  const savePlan = async (e) => {
    e?.preventDefault();
    if (!title || standards.length === 0) {
      setError("Title and at least one standard required.");
      return;
    }
    setSaving(true);
    const payload = { date: today, weekday, title, standards, objective,
      prepSteps: prepSteps.filter(Boolean), seqSteps: seqSteps.filter(Boolean), prepDone, seqDone,
      updatedAt: serverTimestamp() };
    try {
      if (planId) {
        await updateDoc(doc(db, "teachers", user.uid, "dailyPlans", planId), payload);
      } else {
        const ref = await addDoc(collection(db, "teachers", user.uid, "dailyPlans"), {...payload, createdAt: serverTimestamp()});
        setPlanId(ref.id);
      }
      setPlan(payload);
      setSuccess(true);
      setIsEditing(false);
    } catch {
      setError("Save failed, try again.");
    }
    setSaving(false);
  };

  if (loading) return <div className="p-6 text-center">Loading…</div>;

  // VIEW MODE
  if (!isEditing && plan) {
    const prepItems = Array.isArray(plan.prepSteps) ? plan.prepSteps : [];
    const seqItems = Array.isArray(plan.seqSteps) ? plan.seqSteps : [];
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <div className="flex justify-between items-center">
          <button onClick={() => changeDate(-1)}>←</button>
          <div className="relative">
            <h1 onClick={() => setShowCalendar(true)} className="cursor-pointer text-2xl font-bold">{weekday}, {today}</h1>
            {showCalendar && (<input type="date" value={currentDate.toISOString().slice(0,10)} onChange={e => setCurrentDate(new Date(e.target.value))} onBlur={() => setShowCalendar(false)} className="absolute top-full mt-1 border rounded" autoFocus />)}
          </div>
          <button onClick={() => changeDate(1)}>→</button>
        </div>
        <button onClick={() => setIsEditing(true)} className="px-3 py-1 bg-yellow-400 rounded text-white">Edit</button>
        <h2 className="text-xl font-semibold">{plan.title}</h2>
        <div><strong>Standards:</strong><ul className="list-disc pl-6 mt-2">{plan.standards.map(code => { const s = ela8.find(x => x.code===code); return <li key={code}>{code}: {s?.text}</li>; })}</ul></div>
        {plan.objective && <section className="bg-gray-100 p-4 rounded-lg"><strong>Objective:</strong><p className="mt-1">{plan.objective}</p></section>}
        {prepItems.length>0 && <section className="bg-gray-100 p-4 rounded-lg"><h3 className="font-medium mb-2">What do I need?</h3><ul className="pl-6 space-y-1">{prepItems.map((step,i)=><li key={i} className="flex items-center"><input type="checkbox" checked={prepDone[i]||false} onChange={async()=>{const u=[...prepDone];u[i]=!u[i];setPrepDone(u);await updateDoc(doc(db,"teachers",user.uid,"dailyPlans",planId),{prepDone:u});setPlan(p=>({...p,prepDone:u}));}} className="mr-2"/> <span className={prepDone[i]?"line-through text-gray-500":""}>{step}</span></li>)}</ul></section>}
        {seqItems.length>0 && <section className="bg-gray-100 p-4 rounded-lg"><h3 className="font-medium mb-2">Planned Lesson Sequence</h3><ul className="pl-6 space-y-1">{seqItems.map((step,i)=><li key={i} className="flex items-center"><input type="checkbox" checked={seqDone[i]||false} onChange={async()=>{const u=[...seqDone];u[i]=!u[i];setSeqDone(u);await updateDoc(doc(db,"teachers",user.uid,"dailyPlans",planId),{seqDone:u});setPlan(p=>({...p,seqDone:u}));}} className="mr-2"/> <span className={seqDone[i]?"line-through text-gray-500":""}>{step}</span></li>)}</ul></section>}
      </div>
    );
  }

  // EDIT MODE
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <button onClick={() => changeDate(-1)}>←</button>
        <h1 className="text-2xl font-bold">Daily Plan - {weekday}, {today}</h1>
        <button onClick={() => changeDate(1)}>→</button>
      </div>
      <form onSubmit={savePlan} className="space-y-6">
        <section className="bg-gray-50 p-4 rounded-lg"><label className="block text-lg font-medium mb-2">Lesson Title</label><input type="text" className="w-full border rounded p-2" value={title} onChange={e=>setTitle(e.target.value)} required/></section>
        <section className="bg-gray-50 p-4 rounded-lg"><label className="block text-lg font-medium mb-2">Standards</label><Select isMulti options={standardOptions} value={standardOptions.filter(o=>standards.includes(o.value))} onChange={opts=>setStandards(opts?opts.map(x=>x.value):[])} /></section>
        <section className="bg-gray-50 p-4 rounded-lg"><label className="block text-lg font-medium mb-2">Objective</label><input type="text" className="w-full border rounded p-2" value={objective} onChange={e=>setObjective(e.target.value)}/></section>
        <section className="bg-gray-50 p-4 rounded-lg"><label className="block text-lg font-medium mb-2">What do I need?</label>{prepSteps.map((step,i)=><div key={i} className="flex items-start space-x-2 mb-2"><textarea className="flex-1 border rounded p-2 resize-none overflow-hidden" rows={1} value={step} onChange={e=>{const arr=[...prepSteps];arr[i]=e.target.value;setPrepSteps(arr);}} onInput={e=>{e.target.style.height='auto';e.target.style.height=`${e.target.scrollHeight}px`;}} placeholder={`Thing ${i+1}`}/><button type="button" onClick={()=>{const arr=prepSteps.filter((_,j)=>j!==i);setPrepSteps(arr.length?arr:['']);const chk=prepDone.filter((_,j)=>j!==i);setPrepDone(chk.length?chk:[]);}} className="px-2 py-1 bg-red-300 rounded">✕</button></div>)}<button type="button" onClick={()=>{setPrepSteps([...prepSteps,'']);setPrepDone([...prepDone,false]);}} className="px-4 py-2 bg-green-300 rounded">+ Add Thing</button></section>
        <section className="bg-gray-50 p-4 rounded-lg"><label className="block text-lg font-medium mb-2">Planned Lesson Sequence</label>{seqSteps.map((step,i)=><div key={i} className="flex items-start space-x-2 mb-2"><textarea className="flex-1 border rounded p-2 resize-none overflow-hidden" rows={1} value={step} onChange={e=>{const arr=[...seqSteps];arr[i]=e.target.value;setSeqSteps(arr);}} onInput={e=>{e.target.style.height='auto';e.target.style.height=`${e.target.scrollHeight}px`;}} placeholder={`Plan ${i+1}`}/><button type="button" onClick={()=>{const arr=seqSteps.filter((_,j)=>j!==i);setSeqSteps(arr.length?arr:['']);const chk=seqDone.filter((_,j)=>j!==i);setSeqDone(chk.length?chk:[]);}} className="px-2 py-1 bg-red-300 rounded">✕</button></div>)}<button type="button" onClick={()=>{setSeqSteps([...seqSteps,'']);setSeqDone([...seqDone,false]);}} className="px-4 py-2 bg-green-300 rounded">+ Add Plan</button></section>
        {error && <p className="text-red-600">{error}</p>}
        {success && <p className="text-green-600">Saved!</p>}
        <button type="submit" disabled={saving} className="px-6 py-2 bg-blue-600 text-white rounded">{saving?'Saving...':'Save'}</button>
      </form>
    </div>
  );
}
