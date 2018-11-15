const END_SYMBOL = Symbol('end');

class StreamDemux {
  constructor(iterableAsyncStream) {
    this.stream = iterableAsyncStream;
  }

  write(name, data) {
    this.stream.write({
      name,
      data
    });
  }

  end(name) {
    this.stream.write({
      name,
      data: END_SYMBOL
    });
  }

  async *createFilteredStream(stream, name) {
    for await (let packet of stream) {
      if (packet.name === name) {
        if (packet.data === END_SYMBOL) {
          return;
        }
        yield packet.data;
      }
    }
  }

  getStream(name) {
    return this.createFilteredStream(this.stream, name);
  }
}

module.exports = StreamDemux;
