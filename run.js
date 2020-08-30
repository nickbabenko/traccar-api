const express = require('express')
const mysql = require('mysql2/promise')

const app = express()
const port = process.env.PORT || 3000
const deviceId = process.env.DEVICE_ID

const main = async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  })

  const getLatestStatus = async () => {
    const [rows] = connection.execute(`
        SELECT attributes
        FROM tc_positions
        WHERE deviceid = ?
          AND attributes LIKE '%batteryLevel%' 
          AND attributes LIKE '%rssi%'
        ORDER BY id DESC
        LIMIT 1`,
      [deviceId],
    )
    if (rows && rows[0] && rows[0].attributes) {
      const attributes = JSON.parse(rows[0].attributes)
      return {
        batteryLevel: attributes.batteryLevel,
        rssi: attributes.rssi,
      }
    }
  }

  const getLatestLocation = async () => {
    const [rows] = connection.execute(`
      SELECT latitude, longitude, fixtime
      FROM tc_positions
      WHERE deviceid = ?
      ORDER BY id DESC
      LIMIT 1`,
      [deviceId],
    )
    return rows && rows[0] || {}
  }

  app.get('/', async (req, res) => {
    const status = await getLatestStatus()
    const location = await getLatestLocation()
    console.log(status, location)
    res.json({
      ...status,
      ...location,
    })
  })

  app.listen(port, () => {
    console.log(`Traccar API listening at http://localhost:${port}`)
  })
}

main()
