#!/bin/bash
# Stands in for hc during a traced run: records the bytes Voyager exchanges with `hc connect`.
echo "$(date +%s.%N) $*" >>"${ATLAS_CORE_LOG}.args"
exec > >(tee -a "${ATLAS_CORE_LOG}.out.bin")
exec "${ATLAS_HC:-hc}" "$@" < <(tee -a "${ATLAS_CORE_LOG}.in.bin")
