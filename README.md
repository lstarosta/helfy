# Helfy - Full-Stack Authentication Application

A full-stack application with authentication, database integration, and monitoring capabilities.

## Tech Stack

- **Frontend**: HTML/JavaScript (served via Nginx)
- **Backend**: Node.js with Express.js
- **Database**: TiDB (MySQL-compatible distributed database)
- **Message Queue**: Apache Kafka
- **Change Data Capture**: TiDB CDC
- **Logging**: log4js
- **Containerization**: Docker & Docker Compose

## Quick Start

### Prerequisites

- Docker and Docker Compose installed
- 4GB+ RAM available

### Run the Application

```bash
sudo docker compose up --build -d
```

Wait 1-2 minutes for all services to start.

### Access

- **Frontend**: http://localhost:8081
- **API**: http://localhost:3001

### Default Login

```
Email: admin@helfy.com
Password: admin123
```

## Project Structure

```
helfy-devopsjr/
├── api/                    # Node.js API
│   ├── src/index.js        # Main server file
│   ├── Dockerfile
│   └── package.json
├── client/                 # Frontend
│   ├── index.html
│   ├── nginx.conf
│   └── Dockerfile
├── cdc-consumer/           # Kafka CDC Consumer
│   ├── src/index.js
│   ├── Dockerfile
│   └── package.json
├── db/                     # Database
│   ├── schema.sql
│   └── seed.sql
├── docker-compose.yml
└── README.md
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/register` | User registration |
| POST | `/api/auth/logout` | User logout |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/auth/verify` | Verify token |
| GET | `/health` | Health check |

## Token Usage

Send token in HTTP header:

```
X-Auth-Token: your-token-here
```

## Logging

### User Activity (log4js JSON format)

```json
{"timestamp":"...","userId":1,"action":"LOGIN","ipAddress":"...","username":"admin"}
```

### CDC Events (database changes)

```json
{"timestamp":"...","source":"tidb-cdc","operation":"INSERT","table":"users","data":{...}}
```

## View Logs

```bash
# API logs
sudo docker compose logs api

# CDC Consumer logs
sudo docker compose logs cdc-consumer

# User activity only
sudo docker compose logs api | grep '"action"'

# CDC events only
sudo docker compose logs cdc-consumer | grep '"operation"'
```

## Docker Services

| Service | Port | Description |
|---------|------|-------------|
| pd | 2379 | TiDB Placement Driver |
| tikv | - | TiDB Key-Value Store |
| tidb | 4000 | TiDB SQL Server |
| zookeeper | 2181 | Kafka Coordination |
| kafka | 9092 | Message Broker |
| ticdc | 8300 | Change Data Capture |
| api | 3001 | Backend API |
| client | 8081 | Frontend |
| cdc-consumer | - | Kafka Consumer |

## Stop Application

```bash
sudo docker compose down
```

## Verify Everything Works

```bash
# Check containers
sudo docker compose ps

# Test login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@helfy.com","password":"admin123"}'

# Check CDC changefeed
curl http://localhost:8300/api/v2/changefeeds
```

## Database Schema

### Users
- id, email, username, password_hash, created_at

### User Tokens
- id, user_id, token, expires_at, created_at
