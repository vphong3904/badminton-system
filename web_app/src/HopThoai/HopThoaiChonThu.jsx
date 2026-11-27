// Hộp thoại (cửa sổ nổi)
import { useState } from 'react'
import { DAY_NAMES } from '../DungChung/bangGia.js'
import { Dialog } from '../DungChung/ThanhPhan.jsx'

// Chọn thứ: bấm từng thứ một để chọn / bỏ chọn, chọn tự do bất kỳ thứ nào (vd T2, T4, T6).
export default function HopThoaiChonThu({ initial, onConfirm, onClose }) {
  const [selected, setSelected] = useState(() => new Set(initial ?? []))
  const [error, setError] = useState('')

  const toggle = (n) => {
    setError('')
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })
  }
  const confirm = () => {
    const list = [...selected].sort((a, b) => a - b)
    if (list.length === 0) return setError('Vui lòng chọn ít nhất một thứ.')
    onConfirm(list)
  }

  return (
    <Dialog title="Chọn thứ" level={2} width={480} onClose={onClose}>
      <div className="day-row">
        {DAY_NAMES.map((d) => {
          const on = selected.has(d.n)
          return (
            <button key={d.n} type="button" className={`day-circle${on ? ' in-range is-edge' : ''}`} aria-pressed={on} onClick={() => toggle(d.n)}>
              {d.short}
            </button>
          )
        })}
      </div>
      {error && <p className="dialog-error">{error}</p>}
      <div className="dialog-two">
        <button
          type="button"
          className="dialog-danger"
          onClick={() => {
            setSelected(new Set())
            setError('')
          }}
        >
          Xóa
        </button>
        <button type="button" className="dialog-primary" onClick={confirm}>
          Chọn
        </button>
      </div>
      <button type="button" className="dialog-ghost dialog-exit" onClick={onClose}>
        Thoát
      </button>
    </Dialog>
  )
}
