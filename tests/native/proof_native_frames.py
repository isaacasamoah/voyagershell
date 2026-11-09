import hashlib
import importlib
import json
import math
import os
from pathlib import Path
import threading
import time
import zlib

import gi

gi.require_version("Gst", "1.0")
gi.require_version("GstVideo", "1.0")
Gst = importlib.import_module("gi.repository.Gst")
GstVideo = importlib.import_module("gi.repository.GstVideo")

Gst.init(None)


class Frames:
    stop_timeout = 3

    def __init__(self, path, capture, roi, frame_limit, seconds_limit, *, source=None):
        if (
            type(frame_limit) is not int
            or frame_limit < 1
            or type(seconds_limit) not in (int, float)
            or not math.isfinite(seconds_limit)
            or seconds_limit <= 0
        ):
            raise ValueError("Use finite frame and time limits")
        width, height = capture["sourceDimensions"]
        left, top, crop_width, crop_height = capture["streamCrop"]
        x, y, self.width, self.height = roi
        if (
            any(
                type(value) is not int
                for value in [width, height, left, top, crop_width, crop_height, *roi]
            )
            or not 0 <= x < x + self.width <= crop_width
            or not 0 <= y < y + self.height <= crop_height
            or not 0 <= left < left + crop_width <= width
            or not 0 <= top < top + crop_height <= height
        ):
            raise ValueError("ROI must fit the unchanged capture crop")
        path = Path(path)
        if not path.is_absolute():
            raise ValueError("Frame evidence requires an absolute path")
        self.metadata_path = path.with_suffix(".jsonl")
        self.pixel_path = path.with_suffix(".rgb.z")
        self.receipt_path = path.with_suffix(".receipt.json")
        self.limit, self.seconds = frame_limit, seconds_limit
        self.max_bytes = ((self.width * 3 + 3) // 4) * 4 * self.height
        self.capture, self.roi = capture, list(roi)
        self.finished, self.done = threading.Event(), threading.Event()
        self.stop_requested = threading.Event()
        self.pending, self.result, self.error = None, None, None
        self.metadata, self.pixels, self.clock, self.source_caps = (
            None,
            None,
            None,
            None,
        )
        self.count, self.reason = 0, None
        self.excluded_sources = 0
        self.source_ns, self.callback_ns, self.metadata_write_ns = 0, 0, 0
        self.thread = None
        self.pipeline = Gst.Pipeline.new(None)
        self.source = source or Gst.ElementFactory.make("pipewiresrc")
        if source is None:
            self.source.set_property("path", str(capture["node"]))
        convert = Gst.ElementFactory.make("videoconvert")
        caps = Gst.ElementFactory.make("capsfilter")
        caps.set_property("caps", Gst.Caps.from_string("video/x-raw,format=RGB"))
        crop = Gst.ElementFactory.make("videocrop")
        for key, value in {
            "left": left + x,
            "top": top + y,
            "right": width - left - x - self.width,
            "bottom": height - top - y - self.height,
        }.items():
            crop.set_property(key, value)
        self.sink = Gst.ElementFactory.make("appsink")
        for key, value in {
            "sync": False,
            "max-buffers": 1,
            "drop": False,
            "emit-signals": True,
            "enable-last-sample": False,
            "wait-on-eos": False,
            "processing-deadline": 0,
        }.items():
            self.sink.set_property(key, value)
        elements = [self.source, crop, convert, caps, self.sink]
        self.plugins = {
            element.get_factory().get_plugin_name(): element.get_factory()
            .get_plugin()
            .get_version()
            for element in elements
        }
        for element in elements:
            self.pipeline.add(element)
        for first, second in zip(elements, elements[1:]):
            if not first.link(second):
                raise ValueError("Frame pipeline could not link")
        self.source.get_static_pad("src").add_probe(
            Gst.PadProbeType.BUFFER, self._source
        )
        self.sink.connect("new-sample", self._sample)

    @staticmethod
    def _metadata(buffer):
        return {
            "ptsNs": None if buffer.pts == Gst.CLOCK_TIME_NONE else buffer.pts,
            "offset": None
            if buffer.offset == Gst.BUFFER_OFFSET_NONE
            else buffer.offset,
            "durationNs": None
            if buffer.duration == Gst.CLOCK_TIME_NONE
            else buffer.duration,
            "flags": int(buffer.get_flags()),
        }

    def _fail(self, error):
        if self.error is None:
            self.error = str(error)
        self.finished.set()

    def _deadline(self):
        if time.monotonic_ns() - self.started >= self.seconds * 1e9:
            raise TimeoutError("Frame collection reached its time limit")

    def _record(self, row):
        before = time.monotonic_ns()
        self.metadata.write(json.dumps(row) + "\n")
        elapsed = time.monotonic_ns() - before
        self.metadata_write_ns += elapsed
        return elapsed

    def _source(self, pad, info):
        before = time.monotonic_ns()
        try:
            if self.count >= self.limit:
                self.excluded_sources += 1
                return Gst.PadProbeReturn.OK
            self._deadline()
            if self.pending is not None:
                raise ValueError("Source/sample correspondence was overwritten")
            metadata = self._metadata(info.get_buffer())
            caps = pad.get_current_caps()
            video = GstVideo.VideoInfo.new_from_caps(caps)
            if self.source_caps is None:
                self.source_caps = caps.to_string()
                self._record({"type": "negotiated-source", "caps": self.source_caps})
            if caps.to_string() != self.source_caps:
                raise ValueError("Negotiated source caps changed")
            self.pending = {
                "source": metadata,
                "sourceReceivedBeforeNs": before,
                "sourceReceivedAfterNs": time.monotonic_ns(),
                "sourceWidth": video.width,
                "sourceHeight": video.height,
                "sourceFormat": video.finfo.name,
                "sourceStrides": list(video.stride),
                "sourceCaps": self.source_caps,
            }
            if [video.width, video.height] != self.capture["sourceDimensions"]:
                raise ValueError("Source dimensions changed")
            if metadata["ptsNs"] is None or metadata["offset"] is None:
                raise ValueError("Source PTS or sequence is missing")
        except Exception as error:
            self._fail(error)
        finally:
            self.source_ns += time.monotonic_ns() - before
        return Gst.PadProbeReturn.OK

    @staticmethod
    def _map_pixels(buffer):
        success, mapped = buffer.map(Gst.MapFlags.READ)
        if not success:
            raise ValueError("ROI buffer could not be mapped")
        try:
            return mapped.data
        finally:
            buffer.unmap(mapped)

    def _sample(self, sink):
        before = time.monotonic_ns()
        try:
            if self.error or self.count >= self.limit:
                return Gst.FlowReturn.EOS
            self._deadline()
            sample = sink.emit("pull-sample")
            received = time.monotonic_ns()
            buffer = sample.get_buffer()
            metadata = self._metadata(buffer)
            pending, self.pending = self.pending, None
            if not pending or any(
                metadata[key] != pending["source"][key] for key in ("ptsNs", "offset")
            ):
                raise ValueError("Source/sample correspondence changed")
            video = GstVideo.VideoInfo.new_from_caps(sample.get_caps())
            size, stride = buffer.get_size(), video.stride[0]
            actual = GstVideo.buffer_get_video_meta(buffer)
            if (
                (video.width, video.height, video.finfo.name)
                != (self.width, self.height, "RGB")
                or size != video.size
                or size > self.max_bytes
                or stride < self.width * 3
                or stride * self.height != size
                or actual is not None
                and (actual.stride[0] != stride or actual.offset[0] != 0)
            ):
                raise ValueError("Cropped sample exceeds the ROI byte bound or stride")
            clock_before = time.monotonic_ns()
            clock = self.pipeline.get_clock()
            if clock is None:
                raise ValueError("Pipeline clock is unavailable")
            if self.clock is not None and self.clock != clock:
                raise ValueError("Selected pipeline clock changed")
            self.clock = clock
            clock_time, base = clock.get_time(), self.pipeline.get_base_time()
            clock_after = time.monotonic_ns()
            segment = sample.get_segment()
            running = segment.to_running_time(Gst.Format.TIME, buffer.pts)
            if running == Gst.CLOCK_TIME_NONE:
                raise ValueError("PTS has no segment running-time relationship")
            mapped_before = time.monotonic_ns()
            raw = self._map_pixels(buffer)
            mapped_after = time.monotonic_ns()
            if len(raw) != size:
                raise ValueError("Mapped ROI size changed")
            compressed = zlib.compress(raw, 1)
            compressed_at = time.monotonic_ns()
            position = self.pixels.tell()
            self.pixels.write(compressed)
            written_at = time.monotonic_ns()
            row = {
                "type": "frame",
                "index": self.count,
                **pending,
                "receivedBeforeNs": before,
                "receivedAfterNs": received,
                "sourceToSampleNs": before - pending["sourceReceivedAfterNs"],
                "sample": metadata,
                "width": video.width,
                "height": video.height,
                "stride": stride,
                "format": video.finfo.name,
                "bytes": size,
                "clock": {
                    "hostBeforeNs": clock_before,
                    "timeNs": clock_time,
                    "baseTimeNs": base,
                    "hostAfterNs": clock_after,
                    "type": clock.__gtype__.name,
                    "name": clock.get_name(),
                    "identity": str(hash(clock)),
                },
                "segment": {
                    "format": segment.format.value_nick,
                    "flags": int(segment.flags),
                    "values": {
                        key: getattr(segment, key)
                        for key in (
                            "start",
                            "stop",
                            "time",
                            "base",
                            "offset",
                            "rate",
                            "applied_rate",
                        )
                    },
                },
                "runningTimeNs": running,
                "pixelOffset": position,
                "pixelLength": len(compressed),
                "pixelSha256": hashlib.sha256(raw).hexdigest(),
                "mappingNs": mapped_after - mapped_before,
                "compressionNs": compressed_at - mapped_after,
                "writeNs": written_at - compressed_at,
            }
            self._deadline()
            write_ns = self._record(row)
            flush_ns = 0
            if self.count == 0:
                before_flush = time.monotonic_ns()
                self.pixels.flush()
                self.metadata.flush()
                flush_ns = time.monotonic_ns() - before_flush
            self._record(
                {
                    "type": "observer",
                    "index": self.count,
                    "callbackUntilCostRecordNs": time.monotonic_ns() - before,
                    "frameMetadataWriteNs": write_ns,
                    "initialFlushNs": flush_ns,
                }
            )
            self._deadline()
            self.count += 1
            if self.count == self.limit:
                self.reason = "frame-limit"
                self.finished.set()
            return Gst.FlowReturn.OK
        except Exception as error:
            self._fail(error)
            return Gst.FlowReturn.ERROR
        finally:
            self.callback_ns += time.monotonic_ns() - before

    def start(self):
        if self.thread is not None:
            raise ValueError("Frame collection already started")
        self.started = time.monotonic_ns()
        try:
            self.metadata = self.metadata_path.open("x")
            self.pixels = self.pixel_path.open("xb")
            self._record(
                {
                    "type": "run",
                    "capture": self.capture,
                    "roi": self.roi,
                    "frameLimit": self.limit,
                    "secondsLimit": self.seconds,
                    "gst": Gst.version_string(),
                    "plugins": self.plugins,
                    "startedNs": self.started,
                }
            )
        except Exception as error:
            self._fail(error)
            self._finalize()
            raise
        self.thread = threading.Thread(target=self._watch, daemon=True)
        self.thread.start()
        return {"metadata": str(self.metadata_path), "pixels": str(self.pixel_path)}

    def _watch(self):
        try:
            self._deadline()
            if (
                self.pipeline.set_state(Gst.State.PLAYING)
                == Gst.StateChangeReturn.FAILURE
            ):
                raise RuntimeError("Frame pipeline could not start")
            bus = self.pipeline.get_bus()
            stopping = False
            while not self.finished.is_set():
                self._deadline()
                if self.stop_requested.is_set() and not stopping:
                    stopping = True
                    self.reason = "requested-stop"
                    self.pipeline.send_event(Gst.Event.new_eos())
                message = bus.timed_pop_filtered(
                    50 * Gst.MSECOND, Gst.MessageType.ERROR | Gst.MessageType.EOS
                )
                if message and message.type == Gst.MessageType.ERROR:
                    raise RuntimeError(str(message.parse_error()[0]))
                if message and message.type == Gst.MessageType.EOS:
                    self._deadline()
                    self.reason = self.reason or "eos"
                    break
            if self.pending is not None:
                raise ValueError("Unmatched admitted source at collection end")
        except Exception as error:
            self._fail(error)
        finally:
            try:
                if (
                    self.pipeline.set_state(Gst.State.NULL)
                    == Gst.StateChangeReturn.FAILURE
                ):
                    raise RuntimeError("Frame pipeline cleanup is unconfirmed")
            except Exception as error:
                self._fail(error)
            self._finalize()

    def _finalize(self):
        costs = {}
        for name, stream in (("metadata", self.metadata), ("pixels", self.pixels)):
            if stream is None:
                continue
            costs[name] = {}
            for operation in ("flush", "close"):
                before = time.monotonic_ns()
                try:
                    getattr(stream, operation)()
                except Exception as error:
                    costs[name][operation + "Error"] = str(error)
                    self._fail(error)
                costs[name][operation + "Ns"] = time.monotonic_ns() - before
        self.result = {
            "type": "completed",
            "frames": self.count,
            "reason": self.reason,
            "error": self.error,
            "complete": self.error is None and self.count > 0,
            "stoppedNs": time.monotonic_ns(),
            "unconsumedSource": self.pending,
            "sourceObserverNs": self.source_ns,
            "callbackNs": self.callback_ns,
            "metadataWriteNs": self.metadata_write_ns,
            "finalization": costs,
            "excludedSourceAfterFrameLimit": self.excluded_sources,
        }
        pending = self.receipt_path.with_suffix(".pending")
        try:
            with pending.open("x") as output:
                output.write(json.dumps(self.result) + "\n")
            os.link(pending, self.receipt_path)
            pending.unlink()
        except Exception as error:
            self.result.update(error=str(error), complete=False)
        finally:
            self.done.set()

    def stop(self, *, wait=False):
        if self.thread is None:
            return None
        if not wait and not self.done.is_set():
            self.stop_requested.set()
        self.thread.join(
            self.seconds + self.stop_timeout if wait else self.stop_timeout
        )
        if self.thread.is_alive():
            self._fail("Frame collector stop is unconfirmed")
            raise TimeoutError(self.error)
        return self.result.copy()
