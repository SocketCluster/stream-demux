const WritableConsumableStream = require('writable-consumable-stream');
const DemuxedConsumableStream = require('./demuxed-consumable-stream');

class StreamDemux {
  constructor() {
    // A null-prototype object is used so that stream names which collide with
    // Object.prototype members (such as __proto__, constructor or toString)
    // are treated as ordinary stream names instead of resolving to inherited
    // properties. Without this, lookups such as this.streams[streamName]
    // return an inherited value for those names; the truthiness checks
    // throughout this class then pass and the subsequent stream method call
    // throws a TypeError.
    this.streams = Object.create(null);
    this._nextConsumerId = 1;
    this.generateConsumerId = () => {
      return this._nextConsumerId++;
    };
  }

  write(streamName, value) {
    if (this.streams[streamName]) {
      this.streams[streamName].write(value);
    }
  }

  close(streamName, value) {
    if (this.streams[streamName]) {
      this.streams[streamName].close(value);
    }
  }

  closeAll(value) {
    for (let stream of Object.values(this.streams)) {
      stream.close(value);
    }
  }

  writeToConsumer(consumerId, value) {
    for (let stream of Object.values(this.streams)) {
      if (stream.hasConsumer(consumerId)) {
        return stream.writeToConsumer(consumerId, value);
      }
    }
  }

  closeConsumer(consumerId, value) {
    for (let stream of Object.values(this.streams)) {
      if (stream.hasConsumer(consumerId)) {
        return stream.closeConsumer(consumerId, value);
      }
    }
  }

  getConsumerStats(consumerId) {
    for (let [streamName, stream] of Object.entries(this.streams)) {
      if (stream.hasConsumer(consumerId)) {
        return {
          ...stream.getConsumerStats(consumerId),
          stream: streamName
        };
      }
    }
    return undefined;
  }

  getConsumerStatsList(streamName) {
    if (this.streams[streamName]) {
      return this.streams[streamName]
        .getConsumerStatsList()
        .map(
          (stats) => {
            return {
              ...stats,
              stream: streamName
            };
          }
        );
    }
    return [];
  }

  getConsumerStatsListAll() {
    let allStatsList = [];
    for (let streamName of Object.keys(this.streams)) {
      let statsList = this.getConsumerStatsList(streamName);
      for (let stats of statsList) {
        allStatsList.push(stats);
      }
    }
    return allStatsList;
  }

  kill(streamName, value) {
    if (this.streams[streamName]) {
      this.streams[streamName].kill(value);
    }
  }

  killAll(value) {
    for (let stream of Object.values(this.streams)) {
      stream.kill(value);
    }
  }

  killConsumer(consumerId, value) {
    for (let stream of Object.values(this.streams)) {
      if (stream.hasConsumer(consumerId)) {
        return stream.killConsumer(consumerId, value);
      }
    }
  }

  getBackpressure(streamName) {
    if (this.streams[streamName]) {
      return this.streams[streamName].getBackpressure();
    }
    return 0;
  }

  getBackpressureAll() {
    return Object.values(this.streams).reduce(
      (max, stream) => Math.max(max, stream.getBackpressure()),
      0
    );
  }

  getConsumerBackpressure(consumerId) {
    for (let stream of Object.values(this.streams)) {
      if (stream.hasConsumer(consumerId)) {
        return stream.getConsumerBackpressure(consumerId);
      }
    }
    return 0;
  }

  // Backpressure is pending processing work: a stream counts every unprocessed
  // item in its queue, a consumer only its own share. Queue depth instead
  // counts the nodes a consumer still pins in memory, addressed to it or not.
  getQueueDepth(streamName) {
    if (this.streams[streamName]) {
      return this.streams[streamName].getQueueDepth();
    }
    return 0;
  }

  getQueueDepthAll() {
    return Object.values(this.streams).reduce(
      (max, stream) => Math.max(max, stream.getQueueDepth()),
      0
    );
  }

  getConsumerQueueDepth(consumerId) {
    for (let stream of Object.values(this.streams)) {
      if (stream.hasConsumer(consumerId)) {
        return stream.getConsumerQueueDepth(consumerId);
      }
    }
    return 0;
  }

  hasConsumer(streamName, consumerId) {
    if (this.streams[streamName]) {
      return this.streams[streamName].hasConsumer(consumerId);
    }
    return false;
  }

  hasConsumerAll(consumerId) {
    return Object.values(this.streams).some(stream => stream.hasConsumer(consumerId));
  }

  getConsumerCount(streamName) {
    if (this.streams[streamName]) {
      return this.streams[streamName].getConsumerCount();
    }
    return 0;
  }

  getConsumerCountAll() {
    return Object.values(this.streams).reduce(
      (sum, stream) => sum + stream.getConsumerCount(),
      0
    );
  }

  createConsumer(streamName, timeout) {
    if (!this.streams[streamName]) {
      // The callback checks the stream it belongs to rather than whatever is
      // currently registered under streamName, so a stream which has already
      // been replaced can never remove its successor from the map. Capturing
      // the stream allocates nothing: the callback is stored on the stream
      // either way, so this only adds a binding to a closure which the stream
      // already holds, and the resulting cycle is collected along with it.
      let stream = new WritableConsumableStream({
        generateConsumerId: this.generateConsumerId,
        removeConsumerCallback: () => {
          if (this.streams[streamName] === stream && !stream.getConsumerCount()) {
            delete this.streams[streamName];
          }
        }
      });
      this.streams[streamName] = stream;
    }
    return this.streams[streamName].createConsumer(timeout);
  }

  // Unlike individual consumers, consumable streams support being iterated
  // over by multiple for-await-of loops in parallel.
  stream(streamName) {
    return new DemuxedConsumableStream(this, streamName);
  }

  // Kills the stream's consumers before detaching it. A consumer left attached
  // to a detached stream could not be reached again through the demux: writes
  // would go to a freshly created stream and kill()/close() could not see it,
  // so its for-await-of loop would never end.
  unstream(streamName) {
    let stream = this.streams[streamName];
    if (stream) {
      stream.kill();
    }
    delete this.streams[streamName];
  }
}

module.exports = StreamDemux;
