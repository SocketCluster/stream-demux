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
      this.streams[streamName] = new WritableConsumableStream({
        generateConsumerId: this.generateConsumerId,
        removeConsumerCallback: () => {
          if (!this.getConsumerCount(streamName)) {
            delete this.streams[streamName];
          }
        }
      });
    }
    return this.streams[streamName].createConsumer(timeout);
  }

  // Unlike individual consumers, consumable streams support being iterated
  // over by multiple for-await-of loops in parallel.
  stream(streamName) {
    return new DemuxedConsumableStream(this, streamName);
  }

  unstream(streamName) {
    delete this.streams[streamName];
  }
}

module.exports = StreamDemux;
