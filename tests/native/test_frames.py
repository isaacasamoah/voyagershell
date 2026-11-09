import hashlib
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import Mock, patch
import zlib

from proof_native_frames import Frames, Gst


class FrameTests(unittest.TestCase):
    def test_pointer_owns_one_bounded_frame_consumer(self):
        from proof_native_pointer import Pointer

        pointer = Pointer.__new__(Pointer)
        pointer.nodes = {"owned-stream": 12}
        pointer.recording = pointer.frame_observer = None
        capture = {"stream": "owned-stream", "node": 12}
        with patch("proof_native_frames.Frames") as factory:
            expected = factory.return_value.start.return_value
            self.assertEqual(
                pointer.frames_start("/tmp/frames", capture, [0, 0, 128, 64], 60, 2),
                expected,
            )
            with self.assertRaises(AssertionError):
                pointer.frames_start("/tmp/second", capture, [0, 0, 2, 2], 1, 1)
            with self.assertRaises(AssertionError):
                pointer.capture("/tmp/second.png", [0, 0, 2, 2], 1)
            with self.assertRaises(AssertionError):
                pointer.record_start("/tmp/second.webm", capture)
            expected = factory.return_value.stop.return_value
            self.assertEqual(pointer.frames_stop(), expected)
            self.assertIsNone(pointer.frame_observer)
            factory.return_value.stop.assert_called_once_with()
            factory.assert_called_once_with(
                "/tmp/frames", capture, [0, 0, 128, 64], 60, 2
            )

    def test_pointer_refuses_stale_or_large_capture_before_construction(self):
        from proof_native_pointer import Pointer

        pointer = Pointer.__new__(Pointer)
        pointer.nodes = {"owned-stream": 12}
        pointer.recording = pointer.frame_observer = None
        for stream, node, roi, frames, seconds in [
            ("missing", None, [0, 0, 2, 2], 1, 1),
            ("owned-stream", 13, [0, 0, 2, 2], 1, 1),
            ("owned-stream", 12, [0, 0, 512, 512], 1, 1),
            ("owned-stream", 12, [0, 0, 2, 2], 4097, 1),
            ("owned-stream", 12, [0, 0, 2, 2], 1, 31),
        ]:
            with (
                self.subTest(
                    stream=stream, node=node, roi=roi, frames=frames, seconds=seconds
                ),
                patch("proof_native_frames.Frames") as factory,
                self.assertRaises(AssertionError),
            ):
                pointer.frames_start(
                    "/tmp/refused",
                    {"stream": stream, "node": node},
                    roi,
                    frames,
                    seconds,
                )
            factory.assert_not_called()

    def collect(
        self,
        values,
        *,
        mutate=None,
        before=False,
        oversized=False,
        seconds=3,
        dimensions=(8, 4),
        roi=(2, 1, 2, 2),
        read_first=False,
    ):
        width, height = dimensions
        source = Gst.ElementFactory.make("appsrc")
        source.set_property(
            "caps",
            Gst.Caps.from_string(
                f"video/x-raw,format=RGB,width={width},height={height},framerate=0/1"
            ),
        )
        source.set_property("is-live", True)
        source.set_property("format", Gst.Format.TIME)
        if mutate and before:
            source.get_static_pad("src").add_probe(Gst.PadProbeType.BUFFER, mutate)
        capture = {
            "node": 0,
            "sourceDimensions": [width, height],
            "streamCrop": [0, 0, width, height],
        }
        with tempfile.TemporaryDirectory() as directory:
            recorder = Frames(
                Path(directory) / "frames",
                capture,
                roi,
                len(values),
                seconds,
                source=source,
            )
            if mutate and not before:
                source.get_static_pad("src").add_probe(Gst.PadProbeType.BUFFER, mutate)
            guard = patch.object(
                recorder, "_map_pixels", side_effect=AssertionError("mapped")
            )
            if oversized:
                guard.start()
                recorder.max_bytes = 1
            try:
                raws = [
                    bytes(
                        channel
                        for y in range(height)
                        for x in range(width)
                        for channel in (x % 251, y % 251, index + 1)
                    )
                    for index in range(len(values))
                ]
                recorder.start()
                for index, (pts, offset, duration) in enumerate(values):
                    raw = raws[index]
                    buffer = Gst.Buffer.new_allocate(None, len(raw), None)
                    buffer.fill(0, raw)
                    buffer.pts, buffer.offset, buffer.duration = pts, offset, duration
                    flow = source.emit("push-buffer", buffer)
                    if flow != Gst.FlowReturn.OK and recorder.error:
                        break
                    self.assertEqual(flow, Gst.FlowReturn.OK)
                    if read_first and index == 0:
                        deadline = time.monotonic() + 1
                        while recorder.count == 0 and time.monotonic() < deadline:
                            time.sleep(0.005)
                        self.assertGreater(recorder.count, 0)
                        self.assertIn('"type": "frame"', recorder.metadata_path.read_text())
                        self.assertTrue(recorder.pixel_path.read_bytes())
                source.emit("end-of-stream")
                result = recorder.stop(wait=True)
            finally:
                if oversized:
                    guard.stop()
                recorder.stop()
            rows = [
                json.loads(line)
                for line in recorder.metadata_path.read_text().splitlines()
            ]
            pixels = recorder.pixel_path.read_bytes()
        frames = [row for row in rows if row["type"] == "frame"]
        costs = {row["index"]: row for row in rows if row["type"] == "observer"}
        for frame in frames:
            frame["observer"] = costs.get(frame["index"])
            frame["run"] = rows[0]
        return result, frames, pixels

    def test_first_frame_is_readable_before_the_next_frame_or_stop(self):
        result, _, _ = self.collect(
            [(10000000, 10, 20000000), (30000000, 11, 20000000)],
            read_first=True,
        )
        self.assertTrue(result["complete"], result)

    def test_metadata_and_unscaled_pixels_stay_together(self):
        result, frames, pixels = self.collect(
            [
                (10000000, 10, 20000000),
                (30000000, 11, Gst.CLOCK_TIME_NONE),
            ]
        )
        self.assertTrue(result["complete"], result)
        self.assertEqual(len(frames), 2)
        for index, frame in enumerate(frames):
            self.assertEqual(frame["source"]["ptsNs"], 10000000 + index * 20000000)
            self.assertEqual(frame["source"]["offset"], 10 + index)
            self.assertEqual(
                (frame["width"], frame["height"], frame["stride"]), (2, 2, 8)
            )
            start, size = frame["pixelOffset"], frame["pixelLength"]
            raw = zlib.decompress(pixels[start : start + size])
            self.assertEqual(len(raw), 16)
            self.assertEqual(raw[:6], bytes((2, 1, index + 1, 3, 1, index + 1)))
            self.assertEqual(raw[8:14], bytes((2, 2, index + 1, 3, 2, index + 1)))
            self.assertEqual(hashlib.sha256(raw).hexdigest(), frame["pixelSha256"])
            self.assertLessEqual(frame["receivedBeforeNs"], frame["receivedAfterNs"])
            self.assertLessEqual(
                frame["clock"]["hostBeforeNs"], frame["clock"]["hostAfterNs"]
            )
            self.assertGreaterEqual(frame["compressionNs"], 0)
            self.assertGreaterEqual(frame["writeNs"], 0)
            self.assertIn("app", frame["run"]["plugins"])
            self.assertIn("video/x-raw", frame["sourceCaps"])
            self.assertTrue(frame["clock"]["name"])
            self.assertTrue(frame["clock"]["identity"])
            self.assertEqual(frame["segment"]["format"], "time")
            self.assertIn("flags", frame["segment"])
            self.assertGreaterEqual(frame["observer"]["frameMetadataWriteNs"], 0)
        self.assertIsNone(frames[1]["source"]["durationNs"])

    def test_missing_required_metadata_is_not_invented(self):
        for key in ("pts", "offset"):

            def missing(_pad, info):
                setattr(info.get_buffer(), key, Gst.CLOCK_TIME_NONE)
                return Gst.PadProbeReturn.OK

            with self.subTest(key=key):
                result, frames, _ = self.collect(
                    [(1, 1, 1)], mutate=missing, before=True
                )
                self.assertFalse(result["complete"])
                self.assertIn("PTS or sequence", result["error"])
                self.assertEqual(frames, [])

    def test_mismatched_source_sample_is_refused(self):
        def change(_pad, info):
            info.get_buffer().pts += 1
            return Gst.PadProbeReturn.OK

        result, frames, _ = self.collect([(1, 1, 1)], mutate=change)
        self.assertFalse(result["complete"])
        self.assertIn("correspondence", result["error"])
        self.assertEqual(frames, [])

    def test_size_guard_runs_before_mapping(self):
        result, frames, _ = self.collect([(1, 1, 1)], oversized=True)
        self.assertFalse(result["complete"])
        self.assertIn("ROI byte bound", result["error"])
        self.assertNotIn("mapped", result["error"])
        self.assertEqual(frames, [])

    def test_unpaired_source_at_eos_is_not_complete(self):
        def drop_last(_pad, info):
            return (
                Gst.PadProbeReturn.DROP
                if info.get_buffer().offset == 11
                else Gst.PadProbeReturn.OK
            )

        result, _, _ = self.collect([(1, 10, 1), (2, 11, 1)], mutate=drop_last)
        self.assertFalse(result["complete"])
        self.assertIn("Unmatched", result["error"])

    def test_expired_deadline_cannot_accept_a_frame(self):
        result, _, _ = self.collect([(1, 1, 1)], seconds=1e-12)
        self.assertFalse(result["complete"])
        self.assertIn("time limit", result["error"])

    def test_large_source_crop_preserves_its_exact_origin(self):
        result, frames, pixels = self.collect(
            [(1, 1, 1)], dimensions=(640, 480), roi=(123, 77, 2, 2)
        )
        self.assertTrue(result["complete"], result)
        self.assertEqual(frames[0]["bytes"], 16)
        self.assertEqual(zlib.decompress(pixels)[:6], bytes((123, 77, 1, 124, 77, 1)))

    def test_actual_oversized_backing_buffer_is_not_mapped(self):
        recorder = self.recorder(Path("/var/tmp/unused-frame-negative"))
        buffer = Gst.Buffer.new_allocate(None, 4096, None)
        buffer.pts, buffer.offset = 1, 1
        sample = Gst.Sample.new(
            buffer,
            Gst.Caps.from_string("video/x-raw,format=RGB,width=2,height=2"),
            None,
            None,
        )
        recorder.pending = {"source": recorder._metadata(buffer)}
        recorder.started = time.monotonic_ns()
        sink = Mock()
        sink.emit.return_value = sample
        with patch.object(
            recorder, "_map_pixels", side_effect=AssertionError("mapped")
        ):
            self.assertEqual(recorder._sample(sink), Gst.FlowReturn.ERROR)
        self.assertIn("ROI byte bound", recorder.error)

    def recorder(self, path):
        source = Gst.ElementFactory.make("appsrc")
        source.set_property(
            "caps",
            Gst.Caps.from_string(
                "video/x-raw,format=RGB,width=8,height=4,framerate=0/1"
            ),
        )
        source.set_property("is-live", True)
        capture = {"node": 0, "sourceDimensions": [8, 4], "streamCrop": [0, 0, 8, 4]}
        return Frames(path, capture, [0, 0, 2, 2], 1, 1, source=source)

    def test_final_flush_failure_closes_both_files_and_cannot_commit_success(self):
        with tempfile.TemporaryDirectory() as directory:
            recorder = self.recorder(Path(directory) / "failed")
            metadata = recorder.metadata_path.open("x")
            pixels = recorder.pixel_path.open("xb")
            recorder.metadata, recorder.pixels = metadata, Mock(wraps=pixels)
            recorder.pixels.flush.side_effect = OSError("pixel flush failed")
            recorder.count, recorder.reason = 1, "eos"
            recorder._finalize()
            self.assertTrue(metadata.closed and pixels.closed)
            self.assertFalse(recorder.result["complete"])
            self.assertFalse(json.loads(recorder.receipt_path.read_text())["complete"])
            self.assertIn("pixel flush failed", recorder.result["error"])

    def test_failed_header_write_closes_every_opened_file(self):
        original_open, opened = Path.open, []

        def opening(path, *args, **kwargs):
            stream = original_open(path, *args, **kwargs)
            opened.append(stream)
            if path.suffix == ".jsonl":
                wrapped = Mock(wraps=stream)
                wrapped.write.side_effect = OSError("header write failed")
                return wrapped
            return stream

        with tempfile.TemporaryDirectory() as directory:
            recorder = self.recorder(Path(directory) / "failed")
            with patch.object(Path, "open", opening):
                with self.assertRaisesRegex(OSError, "header write failed"):
                    recorder.start()
            self.assertTrue(all(stream.closed for stream in opened))
            self.assertFalse(recorder.result["complete"])

    def test_stop_is_bounded_when_worker_eos_blocks(self):
        entered, release = threading.Event(), threading.Event()

        def blocked(_event):
            entered.set()
            release.wait(2)
            return False

        with tempfile.TemporaryDirectory() as directory:
            recorder = self.recorder(Path(directory) / "stalled")
            recorder.stop_timeout = 0.2
            recorder.start()
            try:
                with patch.object(recorder.pipeline, "send_event", blocked):
                    with self.assertRaisesRegex(TimeoutError, "unconfirmed"):
                        recorder.stop()
                    self.assertTrue(entered.is_set())
                    self.assertTrue(recorder.thread.is_alive())
                    self.assertFalse(recorder.receipt_path.exists())
            finally:
                release.set()
                result = recorder.stop(wait=True)
            self.assertFalse(result["complete"])
            self.assertFalse(recorder.thread.is_alive())

    def test_missing_segment_relationship_is_not_complete(self):
        with patch.object(
            Gst.Segment, "to_running_time", return_value=Gst.CLOCK_TIME_NONE
        ):
            result, frames, _ = self.collect([(1, 1, 1)])
        self.assertFalse(result["complete"])
        self.assertIn("running-time", result["error"])
        self.assertEqual(frames, [])


if __name__ == "__main__":
    unittest.main()
