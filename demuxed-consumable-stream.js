const ConsumableStream = require('consumable-stream');

class DemuxedConsumableStream extends ConsumableStream {
  constructor(streamDemux, name) {
    super();
    this.name = name;
    this._streamDemux = streamDemux;
  }

  hasConsumer(consumerId) {
    return this._streamDemux.hasConsumer(this.name, consumerId);
  }

  getConsumerStats(consumerId) {
    if (!this.hasConsumer(consumerId)) {
      return undefined;
    }
    return this._streamDemux.getConsumerStats(consumerId);
  }

  getConsumerStatsList() {
    return this._streamDemux.getConsumerStatsList(this.name);
  }

  getBackpressure() {
    return this._streamDemux.getBackpressure(this.name);
  }

  getConsumerBackpressure(consumerId) {
    if (!this.hasConsumer(consumerId)) {
      return 0;
    }
    return this._streamDemux.getConsumerBackpressure(consumerId);
  }

  createConsumer(timeout) {
    return this._streamDemux.createConsumer(this.name, timeout);
  }
}

module.exports = DemuxedConsumableStream;
