// Hộp thoại (cửa sổ nổi)
import { useState } from 'react'
import { Dialog } from '../DungChung/ThanhPhan.jsx'
import { SLOT_MIN, toHHMM, toMinutes } from '../DungChung/thoiGian.js'

// Chọn khung giờ (bấm giờ bắt đầu rồi giờ kết thúc); mỗi mốc cách nhau 30 phút (SLOT_MIN)
export default function HopThoaiChonKhungGio({ open, close, initial, onConfirm, onClose }) {
  const [start, setStart] = useState(initial?.[0] ?? null)
  const [end, setEnd] = useState(initial?.[1] ?? null)

  const slots = []
  for (let m = toMinutes(open); m <= toMinutes(close); m += SLOT_MIN) slots.push(toHHMM(m))
  // Luôn hiển thị giờ mở cửa (mốc đầu) và giờ đóng cửa (mốc cuối)
  if (slots[slots.length - 1] !== toHHMM(toMinutes(close))) slots.push(toHHMM(toMinutes(close)))

  const pick = (t) => {
    if (start === null || end !== null) {
      setStart(t)
      setEnd(null)
    } else if (toMinutes(t) > toMinutes(start)) {
      setEnd(t)
    } else {
      setStart(t)
    }
  }

  return (
    <Dialog title="Chọn khung giờ" level={2} width={640} onClose={onClose}>
      <p className="picker-hint">Bấm giờ bắt đầu rồi bấm giờ kết thúc.</p>
      <div className="slot-grid">
        {slots.map((t) => {
          const inRange = start && end && toMinutes(t) >= toMinutes(start) && toMinutes(t) <= toMinutes(end)
          const edge = t === start || t === end
          return (
            <button key={t} type="button" className={`slot-pick${inRange ? ' in-range' : ''}${edge ? ' is-edge' : ''}`} onClick={() => pick(t)}>
              {t}
            </button>
          )
        })}
      </div>
      <div className="dialog-two">
        <button type="button" className="dialog-ghost" onClick={onClose}>
          Thoát
        </button>
        <button type="button" className="dialog-primary" disabled={!start || !end} onClick={() => onConfirm([start, end])}>
          Chọn
        </button>
      </div>
    </Dialog>
  )
}
