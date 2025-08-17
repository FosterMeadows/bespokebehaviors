// src/components/DailyPlan/PrepNamesModal.jsx
export default function PrepNamesModal({ isOpen, editPreps, setEditPreps, onClose, onSave }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 min-w-[320px]">
        <h2 className="text-lg font-bold mb-4">Edit Preps</h2>
        {editPreps.map((p, idx) => (
          <div key={p.id} className="flex items-center space-x-2 mb-2">
            <input
              className="border rounded p-1 flex-1"
              value={p.name}
              onChange={e => {
                const arr = [...editPreps];
                arr[idx].name = e.target.value;
                setEditPreps(arr);
              }}
            />
            {editPreps.length > 1 && (
              <button
                onClick={() => {
                  const arr = [...editPreps];
                  arr.splice(idx, 1);
                  setEditPreps(arr);
                }}
                className="px-2 py-1 bg-red-300 hover:bg-red-400 rounded"
              >✕</button>
            )}
          </div>
        ))}
        <button
          onClick={() => setEditPreps([...editPreps, { id: `prep${Date.now()}`, name: "" }])}
          className="px-4 py-2 bg-green-300 hover:bg-green-400 rounded transition mb-3"
        >+ Add Prep</button>
        <div className="flex justify-end space-x-2">
          <button onClick={onClose} className="px-4 py-1 bg-gray-300 rounded">Cancel</button>
          <button onClick={onSave} className="px-4 py-1 bg-blue-500 text-white rounded">Save</button>
        </div>
      </div>
    </div>
  );
}