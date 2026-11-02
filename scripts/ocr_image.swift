#!/usr/bin/env swift
import Foundation
import Vision
import AppKit

guard CommandLine.arguments.count > 1 else {
    print("Usage: ocr_image.swift <path-to-image>")
    exit(1)
}

let imagePath = CommandLine.arguments[1]
let url = URL(fileURLWithPath: imagePath)

guard let image = NSImage(contentsOf: url),
      let tiffData = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiffData),
      let cgImage = bitmap.cgImage else {
    fputs("Error: Could not load image at \(imagePath)\n", stderr)
    exit(1)
}

let request = VNRecognizeTextRequest { request, error in
    guard let observations = request.results as? [VNRecognizedTextObservation], error == nil else {
        return
    }
    let strings = observations.compactMap { $0.topCandidates(1).first?.string }
    print(strings.joined(separator: "\n"))
}

request.recognitionLevel = .accurate
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
    try handler.perform([request])
} catch {
    fputs("Error during text recognition: \(error)\n", stderr)
    exit(1)
}

