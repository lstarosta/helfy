/**
 * Helfy CDC Consumer
 * Consumes database change messages from Kafka and logs them
 */

const { Kafka } = require('kafkajs');
const log4js = require('log4js');

// ============================================
// LOGGING SETUP
// ============================================
log4js.configure({
  appenders: {
    console: { type: 'console', layout: { type: 'pattern', pattern: '%m' } },
    default: { type: 'console', layout: { type: 'pattern', pattern: '[%d] [%p] %c - %m' } }
  },
  categories: {
    default: { appenders: ['default'], level: 'info' },
    cdc: { appenders: ['console'], level: 'info' }
  }
});

const logger = log4js.getLogger('default');
const cdcLogger = log4js.getLogger('cdc');

// ============================================
// KAFKA CONFIGURATION
// ============================================
const BROKER = process.env.KAFKA_BROKER || 'kafka:9092';
const TOPIC = process.env.KAFKA_TOPIC || 'tidb-cdc';
const GROUP = 'cdc-consumer-group';

const kafka = new Kafka({
  clientId: 'helfy-cdc-consumer',
  brokers: [BROKER],
  retry: { initialRetryTime: 1000, retries: 10 }
});

const consumer = kafka.consumer({ groupId: GROUP });

// ============================================
// PROCESS CDC MESSAGES
// ============================================
function processMessage(message) {
  try {
    const value = message.value.toString();
    let data;
    
    try {
      data = JSON.parse(value);
    } catch {
      data = { raw: value };
    }

    // Log in structured JSON format
    const logEntry = {
      timestamp: new Date().toISOString(),
      source: 'tidb-cdc',
      topic: message.topic,
      partition: message.partition,
      offset: message.offset,
      operation: data.type || 'UNKNOWN',
      table: data.table || 'unknown',
      database: data.database || 'helfy',
      data: data.data || data
    };

    cdcLogger.info(JSON.stringify(logEntry));
  } catch (err) {
    logger.error('Error processing message:', err.message);
  }
}

// ============================================
// WAIT FOR KAFKA
// ============================================
async function waitForKafka() {
  for (let i = 0; i < 60; i++) {
    try {
      const admin = kafka.admin();
      await admin.connect();
      await admin.listTopics();
      await admin.disconnect();
      logger.info('Kafka connected!');
      return;
    } catch (err) {
      logger.warn(`Waiting for Kafka... (${i + 1}/60)`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw new Error('Kafka connection failed');
}

// ============================================
// MAIN
// ============================================
async function main() {
  logger.info('Starting CDC Consumer...');
  logger.info(`Broker: ${BROKER}`);
  logger.info(`Topic: ${TOPIC}`);

  await waitForKafka();
  await consumer.connect();
  logger.info('Consumer connected');

  await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
  logger.info(`Subscribed to: ${TOPIC}`);

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      processMessage({ topic, partition, offset: message.offset, value: message.value });
    }
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  await consumer.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await consumer.disconnect();
  process.exit(0);
});

main().catch(err => {
  logger.error('Fatal error:', err.message);
  process.exit(1);
});
