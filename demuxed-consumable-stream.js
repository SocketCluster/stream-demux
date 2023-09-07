const ConsumableStream = require('consumable-stream');

class DemuxedConsumableStream extends ConsumableStream {
  constructor(streamDemux, name, usabilityMode) {
    super();
    this._streamDemux = streamDemux;
    this.name = name;
    this.usabilityMode = !!usabilityMode;
  }

  createConsumer(timeout) {
    return this._streamDemux.createConsumer(
      this.name,
      timeout,
      this.usabilityMode
    );
  }
}

module.exports = DemuxedConsumableStream;
