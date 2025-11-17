import { useEffect, useMemo, useState } from 'react'
import Spline from '@splinetool/react-spline'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || (typeof window !== 'undefined' ? `${window.location.origin.replace(':3000', ':8000')}` : 'http://localhost:8000')

function useStations() {
  const [stations, setStations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchStations = async () => {
    try {
      setLoading(true)
      const res = await fetch(`${BACKEND_URL}/stations`)
      const data = await res.json()
      setStations(data.stations || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStations()
    const id = setInterval(fetchStations, 5000)
    return () => clearInterval(id)
  }, [])

  return { stations, loading, error, refresh: fetchStations }
}

function PaymentModal({ open, onClose, station }) {
  const [step, setStep] = useState('details')
  const [kwh, setKwh] = useState(10)
  const [intent, setIntent] = useState(null)
  const [card, setCard] = useState({ number: '4242 4242 4242 4242', expMonth: 12, expYear: 2030, cvc: '123' })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) {
      setStep('details'); setIntent(null); setResult(null)
    }
  }, [open])

  if (!open || !station) return null

  const amount = (kwh * station.price_tnd_per_kwh).toFixed(3)

  const createIntent = async () => {
    try {
      setLoading(true)
      const res = await fetch(`${BACKEND_URL}/payments/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ station_id: station.id, kwh: Number(kwh), price_tnd_per_kwh: station.price_tnd_per_kwh })
      })
      const data = await res.json()
      setIntent(data)
      setStep('confirm')
    } catch (e) {
      setResult({ status: 'failed', message: e.message })
      setStep('result')
    } finally {
      setLoading(false)
    }
  }

  const confirmPayment = async () => {
    try {
      setLoading(true)
      const res = await fetch(`${BACKEND_URL}/payments/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_secret: intent?.client_secret,
          card_number: card.number,
          exp_month: Number(card.expMonth),
          exp_year: Number(card.expYear),
          cvc: card.cvc,
        })
      })
      const data = await res.json()
      setResult(data)
      setStep('result')
    } catch (e) {
      setResult({ status: 'failed', message: e.message })
      setStep('result')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="w-full sm:max-w-md bg-[#0B1020] text-white rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl border border-cyan-500/20">
        <div className="mb-4">
          <h3 className="text-xl font-semibold">Start session at {station.name}</h3>
          <p className="text-sm text-cyan-300/80">{station.city} • {station.power_kw}kW • {station.price_tnd_per_kwh} TND/kWh</p>
        </div>

        {step === 'details' && (
          <div className="space-y-4">
            <label className="block text-sm">kWh to charge</label>
            <input type="number" min="1" value={kwh} onChange={e=>setKwh(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded px-3 py-2"/>
            <div className="flex items-center justify-between text-cyan-300">
              <span>Estimated</span>
              <span className="font-semibold">{amount} TND</span>
            </div>
            <button onClick={createIntent} disabled={loading} className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-2 rounded transition">
              {loading ? 'Processing...' : 'Continue'}
            </button>
            <button onClick={onClose} className="w-full bg-white/5 hover:bg-white/10 text-white py-2 rounded">Cancel</button>
          </div>
        )}

        {step === 'confirm' && intent && (
          <div className="space-y-4">
            <div className="text-cyan-200">Amount: <span className="font-semibold">{intent.amount_tnd.toFixed(3)} TND</span></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input value={card.number} onChange={e=>setCard({...card, number: e.target.value})} className="bg-white/5 border border-white/10 rounded px-3 py-2" placeholder="Card Number"/>
              <input value={card.cvc} onChange={e=>setCard({...card, cvc: e.target.value})} className="bg-white/5 border border-white/10 rounded px-3 py-2" placeholder="CVC"/>
              <input type="number" value={card.expMonth} onChange={e=>setCard({...card, expMonth: e.target.value})} className="bg-white/5 border border-white/10 rounded px-3 py-2" placeholder="Exp Month"/>
              <input type="number" value={card.expYear} onChange={e=>setCard({...card, expYear: e.target.value})} className="bg-white/5 border border-white/10 rounded px-3 py-2" placeholder="Exp Year"/>
            </div>
            <button onClick={confirmPayment} disabled={loading} className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-2 rounded">
              {loading ? 'Confirming...' : 'Confirm Payment'}
            </button>
            <button onClick={() => setStep('details')} className="w-full bg-white/5 hover:bg-white/10 text-white py-2 rounded">Back</button>
          </div>
        )}

        {step === 'result' && result && (
          <div className="space-y-4">
            <div className={`p-3 rounded border ${result.status === 'succeeded' ? 'bg-emerald-500/10 border-emerald-400 text-emerald-200' : 'bg-rose-500/10 border-rose-400 text-rose-200'}`}>
              {result.status === 'succeeded' ? `Payment succeeded • ${result.transaction_id}` : `Payment failed • ${result.message || 'Try another card'}`}
            </div>
            <button onClick={onClose} className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-2 rounded">Done</button>
          </div>
        )}
      </div>
    </div>
  )
}

function App() {
  const { stations, loading, error } = useStations()
  const [selected, setSelected] = useState(null)

  const center = useMemo(() => ({ lat: 36.8065, lng: 10.1815 }), []) // Tunis

  return (
    <div className="min-h-screen bg-[#050810] text-white">
      {/* Hero */}
      <div className="relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,.15),transparent_60%),radial-gradient(circle_at_80%_30%,rgba(59,130,246,.15),transparent_60%)] pointer-events-none" />
        <div className="h-[360px] sm:h-[440px] overflow-hidden">
          <Spline scene="https://prod.spline.design/DJYj3a9g9Gd2o3yU/scene.splinecode" />
        </div>
        <div className="absolute inset-x-0 bottom-6 px-4">
          <div className="mx-auto max-w-md bg-black/40 backdrop-blur rounded-2xl border border-cyan-500/20 p-4 shadow-[0_0_40px_rgba(34,211,238,.25)]">
            <h1 className="text-2xl font-semibold">ChargeTunis</h1>
            <p className="text-cyan-300/80 text-sm">Find fast EV chargers across Tunisia and start a session in seconds.</p>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="px-4 py-4">
        <div className="h-[60vh] rounded-2xl overflow-hidden border border-white/10 shadow-[0_0_30px_rgba(59,130,246,.1)]">
          <MapContainer center={center} zoom={10} scrollWheelZoom className="h-full w-full">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            {stations.map((s) => (
              <Marker key={s.id} position={[s.latitude, s.longitude]}>
                <Popup>
                  <div className="space-y-1">
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-xs text-cyan-300">{s.city} • {s.power_kw}kW</div>
                    <div className="text-sm">{s.available ?? 0}/{s.capacity} available</div>
                    <div className="text-sm">{s.price_tnd_per_kwh} TND/kWh</div>
                    <button onClick={() => setSelected(s)} className="mt-2 w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-1.5 rounded">Start Session</button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        {loading && (
          <div className="text-center text-cyan-300 mt-3 text-sm">Loading stations...</div>
        )}
        {error && (
          <div className="text-center text-rose-300 mt-3 text-sm">{error}</div>
        )}
      </div>

      <PaymentModal open={!!selected} onClose={() => setSelected(null)} station={selected} />

      {/* Footer */}
      <div className="px-4 pb-6 mt-2 text-center text-xs text-white/60">
        Built for Tunisia • Live availability is simulated for demo
      </div>
    </div>
  )
}

export default App
