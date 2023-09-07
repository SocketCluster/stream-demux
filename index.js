const WritableConsumableStream = require('writable-consumable-stream');
const DemuxedConsumableStream = require('./demuxed-consumable-stream');
const StreamConsumer = require('./stream-consumer');

class StreamDemux {
  constructor() {
    this._mainStream = new WritableConsumableStream();
  }

  write(streamName, value) {
    this._mainStream.write({
      stream: streamName,
      data: {
        value,
        done: false
      }
    });
  }

  close(streamName, value) {
    this._mainStream.write({
      stream: streamName,
      data: {
        value,
        done: true
      }
    });
  }

  closeAll(value) {
    this._mainStream.close(value);
  }

  writeToConsumer(consumerId, value) {
    this._mainStream.writeToConsumer(consumerId, {
      consumerId,
      data: {
        value,
        done: false
      }
    });
  }

  closeConsumer(consumerId, value) {
    this._mainStream.closeConsumer(consumerId, {
      consumerId,
      data: {
        value,
        done: true
      }
    });
  }

  getConsumerStats(consumerId) {
    return this._mainStream.getConsumerStats(consumerId);
  }

  getConsumerStatsList(streamName) {
    let consumerList = this._mainStream.getConsumerStatsList();
    return consumerList.filter((consumerStats) => {
      return consumerStats.stream === streamName;
    });
  }

  getConsumerStatsListAll() {
    return this._mainStream.getConsumerStatsList();
  }

  kill(streamName, value) {
    let consumerList = this.getConsumerStatsList(streamName);
    let len = consumerList.length;
    for (let i = 0; i < len; i++) {
      this.killConsumer(consumerList[i].id, value);
    }
  }

  killAll(value) {
    this._mainStream.kill(value);
  }

  killConsumer(consumerId, value) {
    this._mainStream.killConsumer(consumerId, value);
  }

  getBackpressure(streamName) {
    let consumerList = this.getConsumerStatsList(streamName);
    let len = consumerList.length;

    let maxBackpressure = 0;
    for (let i = 0; i < len; i++) {
      let consumer = consumerList[i];
      if (consumer.backpressure > maxBackpressure) {
        maxBackpressure = consumer.backpressure;
      }
    }
    return maxBackpressure;
  }

  getBackpressureAll() {
    return this._mainStream.getBackpressure();
  }

  getConsumerBackpressure(consumerId) {
    return this._mainStream.getConsumerBackpressure(consumerId);
  }

  hasConsumer(streamName, consumerId) {
    let consumerStats = this._mainStream.getConsumerStats(consumerId);
    return !!consumerStats && consumerStats.stream === streamName;
  }

  hasConsumerAll(consumerId) {
    return this._mainStream.hasConsumer(consumerId);
  }

  getConsumerCount(streamName) {
    return this.getConsumerStatsList(streamName).length;
  }

  getConsumerCountAll() {
    return this.getConsumerStatsListAll().length;
  }

  createConsumer(streamName, timeout) {
    // TODO 000
    return new StreamConsumer(this._mainStream, this._mainStream.nextConsumerId++, this._mainStream._tailNode, streamName, timeout);
    return this._mainStream.createConsumer(timeout, streamName);

    let mainStreamConsumer = this._mainStream.createConsumer(timeout);

    let consumerNext = mainStreamConsumer.next;
    mainStreamConsumer.next = async function () {
      let timeoutRemaining = timeout;
      while (true) {
        let startTime = Date.now();
        let packet = await consumerNext.call(this, timeoutRemaining);
        let endTime = Date.now();
        timeoutRemaining -= endTime - startTime;
        if (timeoutRemaining < 0) {
          timeoutRemaining = 0;
        }
        // let packet = await consumerNext.apply(this, arguments);// TODO 000
        if (packet.value) {
          if (
            packet.value.stream === streamName ||
            packet.value.consumerId === this.id
          ) {
            if (packet.value.data.done) {
              this.return();
            }
            return packet.value.data;
          }
        }
        if (packet.done) {
          return packet;
        }
      }
    };

    let consumerClearActiveTimeout = mainStreamConsumer.clearActiveTimeout;
    mainStreamConsumer.clearActiveTimeout = function (packet) {
      let { value, done } = packet;
      if (done) {
        consumerClearActiveTimeout.apply(this, arguments);
      } else if (value && value.stream === streamName) {
        consumerClearActiveTimeout.apply(this, arguments);
      }
    };

    let consumerGetStats = mainStreamConsumer.getStats;
    mainStreamConsumer.getStats = function () {
      let stats = consumerGetStats.apply(this, arguments);
      stats.stream = streamName;
      return stats;
    };

    let consumerApplyBackpressure = mainStreamConsumer.applyBackpressure;
    mainStreamConsumer.applyBackpressure = function (packet) {
      if (packet.value) {
        if (
          packet.value.stream === streamName ||
          packet.value.consumerId === this.id
        ) {
          consumerApplyBackpressure.apply(this, arguments);

          return;
        }
      }
      if (packet.done) {
        consumerApplyBackpressure.apply(this, arguments);
      }
    };

    let consumerReleaseBackpressure = mainStreamConsumer.releaseBackpressure;
    mainStreamConsumer.releaseBackpressure = function (packet) {
      if (packet.value) {
        if (
          packet.value.stream === streamName ||
          packet.value.consumerId === this.id
        ) {
          consumerReleaseBackpressure.apply(this, arguments);

          return;
        }
      }
      if (packet.done) {
        consumerReleaseBackpressure.apply(this, arguments);
      }
    };

    return mainStreamConsumer;
  }

  stream(streamName) {
    return new DemuxedConsumableStream(this, streamName);
  }
}

module.exports = StreamDemux;
