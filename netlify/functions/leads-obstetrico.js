
// Función Netlify: acceso seguro a los leads del Reto ECO Materno-Fetal (Ecografía Obstétrica)
// para el panel. Espejo de leads.js, apuntando a la tabla prospectos_eco_obstetrico.
// Protegida con el mismo PIN del panel original (soporta varios PINs separados por comas).
// Variables de entorno requeridas (las mismas del proyecto actual):
//   SUPABASE_URL, SUPABASE_SERVICE_KEY, PANEL_PIN
exports.handler = async (event) => {
  const PINES = (process.env.PANEL_PIN || '').split(',').map(p => p.trim()).filter(Boolean);
  const pinRecibido = (event.headers['x-pin'] || event.headers['X-Pin'] || '').trim();
  if (!PINES.length || !PINES.includes(pinRecibido)) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'PIN incorrecto' }) };
  }
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_KEY;
  const cab = {
    'apikey': KEY,
    'Authorization': 'Bearer ' + KEY,
    'Content-Type': 'application/json'
  };
  /* ===== GET: listar leads ===== */
  if (event.httpMethod === 'GET') {
    try {
      const r = await fetch(
        SUPABASE_URL + '/rest/v1/prospectos_eco_obstetrico?select=*&order=created_at.desc&limit=300',
        { headers: cab }
      );
      if (!r.ok) {
        console.error('Error Supabase GET:', r.status, await r.text());
        return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Error al leer' }) };
      }
      const leads = await r.json();
      return { statusCode: 200, body: JSON.stringify({ ok: true, leads }) };
    } catch (e) {
      console.error('Fallo de red GET:', e);
      return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Error de conexión' }) };
    }
  }
  /* ===== POST: actualizar estado o notas de un lead ===== */
  if (event.httpMethod === 'POST') {
    let cuerpo;
    try { cuerpo = JSON.parse(event.body || '{}'); }
    catch (e) { return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Cuerpo inválido' }) }; }
    const { id, estado, notas } = cuerpo;
    if (!id) return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Falta id' }) };
    const campos = {};
    if (estado) campos.estado = estado;
    if (notas !== undefined) campos.notas = notas;
    if (!Object.keys(campos).length) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Nada que actualizar' }) };
    }
    try {
      const r = await fetch(
        SUPABASE_URL + '/rest/v1/prospectos_eco_obstetrico?id=eq.' + encodeURIComponent(id),
        { method: 'PATCH', headers: { ...cab, 'Prefer': 'return=minimal' }, body: JSON.stringify(campos) }
      );
      if (!r.ok) {
        console.error('Error Supabase PATCH:', r.status, await r.text());
        return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Error al actualizar' }) };
      }
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    } catch (e) {
      console.error('Fallo de red PATCH:', e);
      return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Error de conexión' }) };
    }
  }
  return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Método no permitido' }) };
};
