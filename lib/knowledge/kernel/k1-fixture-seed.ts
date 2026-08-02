import { createHash, randomUUID } from 'node:crypto'
import { canonicalGraphNodeId, canonicalSpaceMemberId } from './canonical-ids'

export interface K1FixtureSeed {
  ownerId: string
  recipientId: string
  voyageId: string
  otherVoyageId: string
  voyageMemberId: string
  recipientVoyageMemberId: string
  spaceId: string
  orphanSpaceId: string
  spaceMemberId: string
  recipientSpaceMemberId: string
  childFormerId: string
  parentFormerId: string
  laterMemberId: string
  childFormerVoyageMemberId: string
  parentFormerVoyageMemberId: string
  laterVoyageMemberId: string
  childFormerSpaceMemberId: string
  parentFormerSpaceMemberId: string
  laterSpaceMemberId: string
  childHistoricalEventId: string
  parentHistoricalEventId: string
  childHistoricalUnitId: string
  parentHistoricalUnitId: string
  orphanSpaceMemberId: string
  recipientOrphanSpaceMemberId: string
  sessionId: string
  orphanSessionId: string
  recipientSessionId: string
  mismatchedSessionId: string
  crossVoyageSessionId: string
  eligibleSourceId: string
  eligibleTargetId: string
  unresolvedEventId: string
  voyageEventId: string
  spaceEventId: string
  orphanSpaceEventId: string
  unlinkedPersonalEventId: string
  malformedSessionEventId: string
  mismatchedSpaceEventId: string
  crossVoyageSessionEventId: string
  recoveryEventId: string
  eligibleEdgeId: string
  unresolvedEdgeId: string
  unitId: string
  unitNodeId: string
  gapUserId: string
  gapVoyageId: string
  gapVoyageMemberId: string
  gapVoyageSpaceId: string
  gapVoyageSpaceMemberId: string
  gapDeleteSpaceId: string
  gapDeleteSpaceMemberId: string
  gapProfileSpaceId: string
  gapProfileSpaceMemberId: string
}

const fixtureUuid = (namespace: string, label: keyof K1FixtureSeed): string => {
  const hex = createHash('sha256').update(`voyager-k1:${namespace}:${label}`).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

export const createK1FixtureSeed = (namespace: string): K1FixtureSeed => {
  if (!namespace) throw new Error('knowledge_graph_k1_namespace_required')
  const id = (label: keyof K1FixtureSeed): string => fixtureUuid(namespace, label)
  const ownerId = id('ownerId')
  const recipientId = id('recipientId')
  const spaceId = id('spaceId')
  const orphanSpaceId = id('orphanSpaceId')
  const childFormerId = id('childFormerId')
  const parentFormerId = id('parentFormerId')
  const laterMemberId = id('laterMemberId')
  const unitId = id('unitId')
  const gapUserId = id('gapUserId')
  const gapVoyageSpaceId = id('gapVoyageSpaceId')
  const gapDeleteSpaceId = id('gapDeleteSpaceId')
  const gapProfileSpaceId = id('gapProfileSpaceId')
  return {
    ownerId, recipientId, voyageId: id('voyageId'), otherVoyageId: id('otherVoyageId'),
    voyageMemberId: id('voyageMemberId'), recipientVoyageMemberId: id('recipientVoyageMemberId'),
    spaceId, orphanSpaceId, spaceMemberId: canonicalSpaceMemberId(spaceId, ownerId),
    recipientSpaceMemberId: canonicalSpaceMemberId(spaceId, recipientId),
    childFormerId, parentFormerId, laterMemberId,
    childFormerVoyageMemberId: id('childFormerVoyageMemberId'),
    parentFormerVoyageMemberId: id('parentFormerVoyageMemberId'),
    laterVoyageMemberId: id('laterVoyageMemberId'),
    childFormerSpaceMemberId: canonicalSpaceMemberId(spaceId, childFormerId),
    parentFormerSpaceMemberId: canonicalSpaceMemberId(spaceId, parentFormerId),
    laterSpaceMemberId: canonicalSpaceMemberId(spaceId, laterMemberId),
    childHistoricalEventId: id('childHistoricalEventId'),
    parentHistoricalEventId: id('parentHistoricalEventId'),
    childHistoricalUnitId: id('childHistoricalUnitId'),
    parentHistoricalUnitId: id('parentHistoricalUnitId'),
    orphanSpaceMemberId: canonicalSpaceMemberId(orphanSpaceId, ownerId),
    recipientOrphanSpaceMemberId: canonicalSpaceMemberId(orphanSpaceId, recipientId),
    sessionId: id('sessionId'), orphanSessionId: id('orphanSessionId'),
    recipientSessionId: id('recipientSessionId'),
    mismatchedSessionId: id('mismatchedSessionId'), crossVoyageSessionId: id('crossVoyageSessionId'),
    eligibleSourceId: id('eligibleSourceId'), eligibleTargetId: id('eligibleTargetId'),
    unresolvedEventId: id('unresolvedEventId'), voyageEventId: id('voyageEventId'),
    spaceEventId: id('spaceEventId'), orphanSpaceEventId: id('orphanSpaceEventId'),
    unlinkedPersonalEventId: id('unlinkedPersonalEventId'),
    malformedSessionEventId: id('malformedSessionEventId'),
    mismatchedSpaceEventId: id('mismatchedSpaceEventId'),
    crossVoyageSessionEventId: id('crossVoyageSessionEventId'), eligibleEdgeId: id('eligibleEdgeId'),
    recoveryEventId: id('recoveryEventId'),
    unresolvedEdgeId: id('unresolvedEdgeId'), unitId,
    unitNodeId: canonicalGraphNodeId('knowledge_unit', unitId),
    gapUserId, gapVoyageId: id('gapVoyageId'), gapVoyageMemberId: id('gapVoyageMemberId'),
    gapVoyageSpaceId,
    gapVoyageSpaceMemberId: canonicalSpaceMemberId(gapVoyageSpaceId, gapUserId),
    gapDeleteSpaceId,
    gapDeleteSpaceMemberId: canonicalSpaceMemberId(gapDeleteSpaceId, gapUserId),
    gapProfileSpaceId,
    gapProfileSpaceMemberId: canonicalSpaceMemberId(gapProfileSpaceId, gapUserId),
  }
}

export const createRandomK1FixtureSeed = (): K1FixtureSeed => createK1FixtureSeed(randomUUID())
