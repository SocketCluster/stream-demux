const AsyncIterableStream = require('async-iterable-stream');
const WritableAsyncIterableStream = require('writable-async-iterable-stream');
const END_SYMBOL = Symbol('end');

class StreamDemux {
  constructor() {
    this.mainStream = new WritableAsyncIterableStream();
  }

  write(name, data) {
    this.mainStream.write({
      name,
      data
    });
  }

  end(name) {
    this.mainStream.write({
      name,
      data: END_SYMBOL
    });
  }

  async *createDemuxedStream(stream, name) {
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
      return this.createDemuxedStream(this.mainStream, name);
    });
  }
}

module.exports = StreamDemux;
