// Función Netlify: guarda el prospecto del Reto ECO y genera
// el mensaje de apertura personalizado para el asesor usando Claude API.
// Variables de entorno requeridas en Netlify:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY

/* ===== Diccionarios para traducir códigos a texto humano ===== */
const T = {
  perfil_profesional: {
    general: 'Médico general', rural: 'Médico rural', residente: 'Residente',
    especialista: 'Especialista', emergencia: 'Médico de emergencia', otro: 'Otro profesional de la salud'
  },
  pacientes_mes: {
    menos_50: 'menos de 50 pacientes/mes', '50_100': '50–100 pacientes/mes',
    '101_200': '101–200 pacientes/mes', '201_400': '201–400 pacientes/mes', mas_400: 'más de 400 pacientes/mes'
  },
  realiza_ecografias: {
    frecuente: 'realiza ecografías con frecuencia', ocasional: 'realiza ecografías ocasionalmente',
    interpreta: 'solo observa o interpreta casos', quiere_aprender: 'no realiza, pero quiere aprender',
    nunca: 'nunca ha tenido contacto con la ecografía'
  },
  etapa_profesional: {
    busca_empleo: 'buscando empleo estable', mejor_puesto: 'empleado, busca mejor puesto',
    consulta_propia: 'tiene consulta propia', postgrado_rural: 'preparando postgrado o rural'
  },
  objetivo_principal: {
    evaluar_pacientes: 'evaluar mejor a sus pacientes', complementar: 'complementar su consulta',
    centro_medico: 'trabajar en un centro médico u hospital', nuevo_servicio: 'incorporar un nuevo servicio',
    perfil_laboral: 'mejorar su perfil profesional y laboral', emprender: 'emprender con un servicio de ecografía'
  },
  objecion_principal: {
    falta_formacion: 'falta de formación estructurada', sin_equipo: 'no tiene ecógrafo',
    no_conoce: 'no conoce el proceso para empezar', falta_tiempo: 'falta de tiempo',
    costo: 'el costo de la capacitación', inseguridad: 'no sabe si podrá aprender'
  },
  nivel_resultado: {
    explorador: 'Explorador', en_desarrollo: 'En Desarrollo',
    clinico_progreso: 'Clínico en Progreso', avanzado: 'Avanzado'
  },
  categorias: {
    c1: 'anatomía ecográfica', c2: 'equipos y transductores', c3: 'interpretación de imagen',
    c4: 'técnica de exploración', c5: 'ecografía clínica (POCUS)', c6: 'criterio clínico'
  }
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Método no permitido' }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  let registro;
  try {
    registro = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Cuerpo inválido' }) };
  }

  /* ===== 1. Generar mensaje de apertura con Claude ===== */
  let mensajeApertura = null;
  try {
    const areasDebiles = (registro.respuestas_detalle || [])
      .filter(d => !d.correcta)
      .map(d => T.categorias[d.pregunta] || d.pregunta);

    const prompt = `Eres el asesor académico de FMC (Formación Médica Continua), una institución ecuatoriana que dicta un diplomado de ecografía clínica de $608 con clases en vivo, práctica y certificación. Un médico acaba de completar una evaluación gratuita llamada Reto ECO. Escribe el PRIMER mensaje de WhatsApp que el asesor le enviará.

Datos del prospecto:
- Nombre: ${registro.nombre}
- País: ${registro.pais}
- Perfil: ${T.perfil_profesional[registro.perfil_profesional] || registro.perfil_profesional}
- Volumen: ${T.pacientes_mes[registro.pacientes_mes] || 'no indicado'}
- Experiencia en eco: ${T.realiza_ecografias[registro.realiza_ecografias] || 'no indicada'}
- Etapa profesional: ${T.etapa_profesional[registro.etapa_profesional] || 'no indicada'}
- Resultado: Nivel ${T.nivel_resultado[registro.nivel_resultado]} (${registro.puntaje_conocimiento}% de conocimiento)
- Áreas débiles detectadas: ${areasDebiles.length ? areasDebiles.join(', ') : 'ninguna, acertó todo'}
- Objetivo al aprender ecografía: ${T.objetivo_principal[registro.objetivo_principal] || 'no indicado'}
- Lo que le impide comenzar: ${T.objecion_principal[registro.objecion_principal] || 'no indicado'}
- Potencial que él mismo calculó: $${registro.potencial_mensual || 0} mensuales

Reglas del mensaje:
- En español, tono cálido y profesional de colega a colega, tratándolo de "Doctor/Doctora" según corresponda por el nombre.
- Máximo 90 palabras.
- Debe demostrar que revisaste SU resultado: menciona su nivel y UNA área débil concreta (si acertó todo, felicítalo por su base).
- Aborda sutilmente su objeción principal sin sonar vendedor (ej. si no tiene equipo: se puede iniciar la formación antes de esa inversión; si es el costo: existen opciones de pago; si duda de poder aprender: el programa va de lo básico a lo clínico).
- Conecta con SU objetivo declarado.
- Cierra ofreciendo enviarle su reporte completo y una orientación breve sin compromiso, con una pregunta simple que invite a responder.
- NO prometas ingresos ni empleo garantizado. NO menciones el precio todavía. NO uses emojis en exceso (máximo 1).

Responde ÚNICAMENTE con el texto del mensaje, sin comillas ni preámbulos.`;

    const respIA = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (respIA.ok) {
      const data = await respIA.json();
      mensajeApertura = (data.content || [])
        .map(b => (b.type === 'text' ? b.text : ''))
        .join('')
        .trim();
    } else {
      console.error('Error Claude API:', respIA.status, await respIA.text());
    }
  } catch (e) {
    console.error('Fallo generando mensaje de apertura:', e);
  }

  /* ===== 2. Guardar en Supabase (con clave de servicio, del lado seguro) ===== */
  registro.mensaje_apertura = mensajeApertura;

  try {
    const respDB = await fetch(SUPABASE_URL + '/rest/v1/prospectos_eco', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(registro)
    });

    if (!respDB.ok) {
      const detalle = await respDB.text();
      console.error('Error Supabase:', respDB.status, detalle);
      return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'No se pudo guardar' }) };
    }
  } catch (e) {
    console.error('Fallo de red con Supabase:', e);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Error de conexión' }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true })
  };
};
