"""Bundle official Lite models with Tasks-compatible tensor metadata.

Developer-only dependencies: numpy, flatbuffers==25.12.19 and the generated
schemas from mediapipe==1.2.2. No Python dependencies are needed by the game.
Pass --schema-dir to use schemas extracted from the official MediaPipe wheel.
"""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import io
import urllib.request
import zipfile

import flatbuffers
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'vendor/mediapipe'
MODELS = {
    'hand_landmark_lite.tflite': 'd7fde8ac11f8ce03f8663775bfc323f4fc9f2a38062b4f4efa142874ef5b2a48',
    'palm_detection_lite.tflite': 'e9a4aaddf90dda56a87235303cf00e4c2d3fb28725f68fd88772997dac905c18',
}


def load_schema(directory, name):
    spec = importlib.util.spec_from_file_location(name, directory / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def add_metadata(lite, reference, schema, metadata_schema):
    model = schema.ModelT.InitFromObj(schema.Model.GetRootAsModel(lite, 0))
    original = schema.Model.GetRootAsModel(reference, 0)
    other = schema.ModelT.InitFromObj(original)
    # Both official variants share the tensor layout and normalization [0,1].
    for field in ['inputs', 'outputs']:
        a, b = model.subgraphs[0], other.subgraphs[0]
        left, right = getattr(a, field), getattr(b, field)
        assert len(left) == len(right)
        for i, j in zip(left, right):
            assert list(a.tensors[i].shape) == list(b.tensors[j].shape)
            assert a.tensors[i].type == b.tensors[j].type
    item = next(original.Metadata(i) for i in range(original.MetadataLength())
                if original.Metadata(i).Name() == b'TFLITE_METADATA')
    data = original.Buffers(item.Buffer()).DataAsNumpy()
    metadata = metadata_schema.ModelMetadataT.InitFromObj(
        metadata_schema.ModelMetadata.GetRootAsModelMetadata(data, 0))
    metadata.name += b' Lite'
    builder = flatbuffers.Builder(2048)
    builder.Finish(metadata.Pack(builder), file_identifier=b'M001')
    buffer = schema.BufferT()
    buffer.data = np.frombuffer(bytes(builder.Output()), dtype=np.uint8)
    model.buffers.append(buffer)
    item = schema.MetadataT()
    item.name, item.buffer = b'TFLITE_METADATA', len(model.buffers) - 1
    model.metadata.append(item)
    builder = flatbuffers.Builder(len(lite) + 2048)
    builder.Finish(model.Pack(builder), file_identifier=b'TFL3')
    packed = bytes(builder.Output())
    verified = schema.Model.GetRootAsModel(packed, 0)
    source = schema.Model.GetRootAsModel(lite, 0)
    for index in range(source.BuffersLength()):
        assert np.array_equal(source.Buffers(index).DataAsNumpy(), verified.Buffers(index).DataAsNumpy()), 'Network weights changed'
    output = io.BytesIO(packed)
    with zipfile.ZipFile(io.BytesIO(reference)) as source, zipfile.ZipFile(output, 'a') as target:
        for name in source.namelist():
            target.writestr(zipfile.ZipInfo(name), source.read(name))
    return output.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--schema-dir', type=Path)
    args = parser.parse_args()
    directory = args.schema_dir
    if directory is None:
        package = importlib.util.find_spec('mediapipe')
        if package is None:
            parser.error('Install mediapipe==1.2.2 or pass --schema-dir.')
        directory = Path(package.origin).parent / 'tasks/metadata'
    schema = load_schema(directory, 'schema_py_generated')
    metadata = load_schema(directory, 'metadata_schema_py_generated')
    models = {}
    for name, expected in MODELS.items():
        with urllib.request.urlopen('https://storage.googleapis.com/mediapipe-assets/' + name) as response:
            models[name] = response.read()
        assert hashlib.sha256(models[name]).hexdigest() == expected, name
    output = ASSETS / 'hand_landmarker_lite.task'
    with zipfile.ZipFile(ASSETS / 'hand_landmarker.task') as original, zipfile.ZipFile(output, 'w') as target:
        for target_name, source_name in [('hand_detector.tflite', 'palm_detection_lite.tflite'),
                                         ('hand_landmarks_detector.tflite', 'hand_landmark_lite.tflite')]:
            data = add_metadata(models[source_name], original.read(target_name), schema, metadata)
            target.writestr(zipfile.ZipInfo(target_name), data)
    print(f'{output.name}: {output.stat().st_size} bytes; SHA-256 {hashlib.sha256(output.read_bytes()).hexdigest()}')


if __name__ == '__main__':
    main()
