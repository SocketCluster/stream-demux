class StreamConsumer {
  constructor(mainStream, id, startNode, streamName, timeout) {
    this.id = id;
    this._backpressure = 0;
    this.currentNode = startNode;
    this.timeout = timeout;
    this.isAlive = true;
    this._mainStream = mainStream;
    this._mainStream.setConsumer(this.id, this);
    this.streamName = streamName;
  }

  getStats() {
    let stats = {
      id: this.id,
      backpressure: this._backpressure,
      stream: this.streamName
    };
    if (this.timeout != null) {
      stats.timeout = this.timeout;
    }
    return stats;
  }

  _resetBackpressure() {
    this._backpressure = 0;
  }

  applyBackpressure(packet) {
    this._backpressure++;
  }

  releaseBackpressure(packet) {
    this._backpressure--;
  }

  getBackpressure() {
    return this._backpressure;
  }

  clearActiveTimeout() {
    clearTimeout(this._timeoutId);
    delete this._timeoutId;
  }

  write(packet) {
    if (!packet.done && packet.value.stream !== this.streamName) return;
    if (this._timeoutId !== undefined) {
      this.clearActiveTimeout(packet);
    }
    this.applyBackpressure(packet);
    if (this._resolve) {
      this._resolve();
      delete this._resolve;
    }
  }

  kill(value) {
    this._killPacket = {value, done: true};
    if (this._timeoutId !== undefined) {
      this.clearActiveTimeout(this._killPacket);
    }
    this._destroy();

    if (this._resolve) {
      this._resolve();
      delete this._resolve;
    }
  }

  _destroy() {
    this.isAlive = false;
    this._resetBackpressure();
    this._mainStream.removeConsumer(this.id);
  }

  async _waitForNextItem(timeout) {
    return new Promise((resolve, reject) => {
      this._resolve = resolve;
      let timeoutId;
      if (timeout !== undefined) {
        // Create the error object in the outer scope in order
        // to get the full stack trace.
        let error = new Error('Stream consumer iteration timed out');
        (async () => {
          let delay = wait(timeout);
          timeoutId = delay.timeoutId;
          await delay.promise;
          error.name = 'TimeoutError';
          delete this._resolve;
          reject(error);
        })();
      }
      this._timeoutId = timeoutId;
    });
  }

  async next() {
    this._mainStream.setConsumer(this.id, this);

    while (true) {
      if (!this.currentNode.next) {
        try {
          await this._waitForNextItem(this.timeout);
        } catch (error) {
          this._destroy();
          throw error;
        }
      }
      if (this._killPacket) {
        this._destroy();
        let killPacket = this._killPacket;
        delete this._killPacket;

        return killPacket;
      }

      // Skip over nodes which belong to different streams.
      while (
        this.currentNode.next?.data?.value &&
        this.currentNode.next.data.value.stream !== this.streamName &&
        this.currentNode.next.consumerId !== this.id
      ) {
        this.currentNode = this.currentNode.next;
      }

      if (!this.currentNode.next) {
        continue;
      }
      this.currentNode = this.currentNode.next;

      this.releaseBackpressure(this.currentNode.data);

      if (this.currentNode.data?.value?.data?.done) {
        this._destroy();
        return this.currentNode.data.value.data;
      }

      if (this.currentNode.data.done) {
        this._destroy();
        return this.currentNode.data;
      }

      return this.currentNode.data.value.data;
    }
  }

  return() {
    delete this.currentNode;
    this._destroy();
    return {};
  }

  [Symbol.asyncIterator]() {
    return this;
  }
}

function wait(timeout) {
  let timeoutId;
  let promise = new Promise((resolve) => {
    timeoutId = setTimeout(resolve, timeout);
  });
  return {timeoutId, promise};
}

module.exports = StreamConsumer;
