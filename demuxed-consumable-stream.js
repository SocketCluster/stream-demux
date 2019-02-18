const ConsumableStream = require('consumable-stream');

class DemuxedConsumableStream extends ConsumableStream {
  constructor(streamDemux, name) {
    super();
    this.name = name;
    this._streamDemux = streamDemux;
  }

  writeToConsumer(consumerId, value) {
    this._streamDemux.writeToConsumer(this.name, consumerId, value);
  }

  closeConsumer(consumerId, value) {
    this._streamDemux.closeConsumer(this.name, consumerId, value);
  }

  getConsumerStats(consumerId) {
    return this._streamDemux.getConsumerStats(consumerId);
  }

  getConsumerStatsList() {
    return this._streamDemux.getConsumerStatsList(this.name);
  }

  kill(value) {
    this._streamDemux.kill(this.name, value);
  }

  killConsumer(consumerId, value) {
    this._streamDemux.killConsumer(consumerId, value);
  }

  getBackpressure(streamName) {
    return this._streamDemux.getBackpressure(this.name);
  }

  getConsumerBackpressure(consumerId) {
    return this._streamDemux.getConsumerBackpressure(consumerId);
  }

  hasConsumer(consumerId) {
    this._streamDemux.hasConsumer(consumerId);
  }

  createConsumer(timeout) {
    return this._streamDemux.createConsumer(this.name, timeout);
  }
}

module.exports = DemuxedConsumableStream;
