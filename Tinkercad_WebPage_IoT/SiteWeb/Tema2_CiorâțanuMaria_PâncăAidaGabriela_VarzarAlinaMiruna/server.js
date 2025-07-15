import express from "express"
import multer from "multer"
import pg from "pg"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/*const express = require('express');
module.exports = something;*/

const app = express()
const port = 3000


const upload = multer({ dest: "uploads/" })


const { Pool } = pg
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "iot",
  password: "diva",
  port: 5432,
})

async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gas_readings (
        id SERIAL PRIMARY KEY,
        gas_value INTEGER NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log("Database initialized successfully")
  } catch (error) {
    console.error("Error initializing database:", error)
  }
}

initializeDatabase()

app.use(express.static(path.join(__dirname, "public")))
app.set("view engine", "ejs")
app.set("views", path.join(__dirname, "views"))


app.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM gas_readings ORDER BY timestamp DESC")
    res.render("index", {
      readings: result.rows,
      message: req.query.message || "",
      messageType: req.query.type || "",
    })
  } catch (error) {
    console.error("Error fetching readings:", error)
    res.render("index", {
      readings: [],
      message: "Failed to fetch readings from database",
      messageType: "error",
    })
  }
})

app.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.redirect("/?message=No file uploaded&type=error")
  }

  try {
    const fileContent = fs.readFileSync(req.file.path, "utf8")
    const lines = fileContent.split("\n")

    // Extract gas values using regex
    const gasValues = []
    const regex = /Gas sensor = (\d+)/

    for (const line of lines) {
      const match = line.match(regex)
      if (match && match[1]) {
        const gasValue = Number.parseInt(match[1], 10)
        if (!isNaN(gasValue)) {
          gasValues.push(gasValue)
        }
      }
    }

    if (gasValues.length === 0) {
      // Delete the uploaded file
      fs.unlinkSync(req.file.path)
      return res.redirect("/?message=No valid gas sensor readings found in the file&type=error")
    }

    // Insert the gas values into the database
    const client = await pool.connect()
    try {
      await client.query("BEGIN")

      for (const value of gasValues) {
        await client.query("INSERT INTO gas_readings (gas_value) VALUES ($1)", [value])
      }

      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }

    // Delete the uploaded file
    fs.unlinkSync(req.file.path)

    res.redirect(`/?message=Successfully inserted ${gasValues.length} gas readings&type=success`)
  } catch (error) {
    console.error("Error processing file:", error)
    res.redirect("/?message=Error processing file&type=error")
  }
})

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`)
})

console.log("Server code is ready to run. To start the server, execute this file with Node.js.")