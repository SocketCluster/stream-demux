const ConsumableStream = require('consumable-stream');

class DemuxedConsumableStream extends ConsumableStream {
  constructor(streamDemux, name) {
    super();
    this.name = name;
    this._streamDemux = streamDemux;
  }

  createConsumer(timeout) {
    return this._streamDemux.createConsumer(this.name, timeout);
  }
}

module.exports = DemuxedConsumableStream;
