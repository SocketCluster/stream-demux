const AsyncIterableStream = require('async-iterable-stream');
const WritableAsyncIterableStream = require('writable-async-iterable-stream');
const END_SYMBOL = Symbol('end');

class StreamDemux {
  constructor() {
    this._mainStream = new WritableAsyncIterableStream();
  }

  write(name, data) {
    this._mainStream.write({
      name,
      data
    });
  }

  end(name) {
    this.write(name, END_SYMBOL);
  }

  endAll() {
    this._mainStream.end();
  }

  async *_createDemuxedStream(stream, name) {
    for await (let packet of stream) {
      if (packet.name === name) {
        if (packet.data === END_SYMBOL) {
          return;
        }
        yield packet.data;
      }
    }
  }

  stream(name) {
    return new AsyncIterableStream(() => {
      return this._createDemuxedStream(this._mainStream, name);
    });
  }
}

module.exports = StreamDemux;
