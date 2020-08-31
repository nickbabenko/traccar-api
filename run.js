const express = require('express')
const mysql = require('mysql2/promise')
const net = require('net')
const fs = require('fs')
const Gt06 = require('./gt06')

const app = express()
const port = process.env.PORT || 3000
const trackerPort = process.env.TRACKER_PORT || 3001

const stamp = () => {
  const date = new Date()
  return `[${date.toISOString()}]: `
}

const main = async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  })

  console.log(`${stamp()}Creating database`)

  const schema = fs.readFileSync(__dirname + '/structure.sql', {
    encoding: 'utf-8',
  })
  await Promise.all(schema.split(';').map(async part => {
    if (part.length === 0) {
      return null
    }
    await connection.execute(part)
  }))

  const getLatestLocation = async (deviceId) => {
    const [rows] = await connection.execute(`
      SELECT p.latitude, p.longitude, p.created_at, d.battery_level, d.rssi
      FROM positions p
      INNER JOIN devices d ON d.id = p.device_id
      WHERE p.device_id = ?
      ORDER BY p.id DESC
      LIMIT 1`,
      [deviceId],
    )
    return rows && rows[0] || null
  }

  const getDevice = async (imei) => {
    const [rows] = await connection.execute(`
      SELECT *
      FROM devices
      WHERE imei = ?`,
      [imei]
    )
    return rows && rows[0] || null
  }

  const createDevice = async (data) => {
    console.log(`${stamp()}createDevice with imei ${data.imei}`)
    let device = await getDevice(data.imei)
    if (!device) {
      console.log(`${stamp()}Device doesnt exist. Creating`)
      await connection.execute(`
        INSERT IGNORE INTO devices (imei, created_at, updated_at)
        VALUES (?, NOW(), NOW())
      `, [data.imei])
      device = await getDevice(data.imei)
    }
    return device
  }

  const updateDevice = async (id, data) => {
    console.log(`${stamp()}updateDevice ${id}. battery level: ${data.voltageLevel}, rssi: ${data.gsmSigStrength}`)
    await connection.execute(`
      UPDATE devices
      SET battery_level = ?, rssi = ?, updated_at = NOW()
      WHERE id = ?
    `, [ data.voltageLevel, data.gsmSigStrength, id ])
  }

  const addPosition = async (deviceId, data) => {
    console.log(`${stamp()}addPosition for device: ${deviceId}. latitude: ${data.latitude}, longitude: ${data.longitude}, date: ${data.date}`)
    const date = data.date
      .replace('T', ' ')
      .replace('.000Z', '')
    await connection.execute(`
      INSERT INTO positions (device_id, latitude, longitude, created_at)
      VALUES (?, ?, ?, ?)
    `, [ deviceId, data.latitude, data.longitude, date])
  }

  app.get('/', async (req, res) => {
    if (!req.query.device_id) {
      return res
        .status(400)
        .send()
    }
    const location = await getLatestLocation(req.query.device_id)
    if (!location) {
      return res
        .status(404)
        .send()
    }
    res.json(location)
  })

  const server = net.createServer(client => {
    const gt06 = new Gt06()
    let device
    client.on('data', data => {
      try {
        gt06.parse(data)
      } catch (e) {
        console.log('err', e)
        return
      }
  
      if (gt06.expectsResponse) {
        client.write(gt06.responseMsg)
      }
  
      gt06.msgBuffer.forEach(async message => {
        switch (message.event.string) {
          case 'login':
            device = await createDevice(message)
            break
          case 'status':
            await updateDevice(device.id, message)
            break
          case 'x1':
            await addPosition(device.id, message)
            break
        }
      })
  
      gt06.clearMsgBuffer()
    })
  })

  app.listen(port, () => {
    console.log(`Data API listening at http://localhost:${port}`)
  })
  server.listen(trackerPort, () => {
    console.log(`GPS API listening at http://localhost:${trackerPort}`)
  })
}

main()
