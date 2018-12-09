const AsyncIterableStream = require('async-iterable-stream');

class DemuxedAsyncIterableStream extends AsyncIterableStream {
  constructor(streamDemux, name) {
    super();
    this.name = name;
    this._streamDemux = streamDemux;
  }

  createAsyncIterator(timeout) {
    return this._streamDemux.createAsyncIterator(this.name, timeout);
  }
}

module.exports = DemuxedAsyncIterableStream;
