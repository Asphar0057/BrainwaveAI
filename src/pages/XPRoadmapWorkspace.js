import { useEffect, useState } from 'react';
import {
  BookOpen,
  Brain,
  CheckCircle,
  ChevronRight,
  Clock,
  Crown,
  FileText,
  Flame,
  Gift,
  Layers,
  LayoutDashboard,
  Lock,
  Map,
  Package,
  Rocket,
  Shield,
  Star,
  Target,
  Trophy,
  User,
  X,
  Zap
} from 'lucide-react';
import SocialHubChrome from '../components/SocialHubChrome';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function XPRoadmapWorkspace({
  loading,
  statsError,
  retryStats,
  navigate,
  shellRef,
  drawerRef,
  drawerCloseRef,
  sidebarCollapsed,
  setSidebarCollapsed,
  levelWave,
  level,
  xp,
  displayName,
  levelProgress,
  levelWindow,
  masteredCount,
  nextNode,
  nextMissionAction,
  stats,
  quests,
  runMechanics,
  decayLabel,
  powerUps,
  powerUpLoading,
  powerNotice,
  handleUsePowerUp,
  chestInventory,
  nextRewards,
  streakChain,
  seasonTrack,
  topicArcs,
  roadmapLoading,
  roadmapError,
  retryRoadmap,
  badgeCollection,
  handleNodeClick,
  scrollToPanel,
  openNextMission,
  setSelectedNode,
  xpBursts,
  selectedNodeDetails,
  missionRecommendations,
  activeMissionTopic,
  setSelectedMissionTopic,
  missionNotice,
  selectedMissionAction,
  selectedCtaLabel,
  missionLoading,
  handleContinueMission
}) {
  const [armedPowerUp, setArmedPowerUp] = useState(null);
  const [activeSection, setActiveSection] = useState('xpv-roadmap');

  useEffect(() => {
    const sidebar = shellRef?.current?.querySelector('.shc-sidebar');
    if (sidebar) sidebar.scrollTop = 0;
  }, [shellRef, sidebarCollapsed]);

  const renderStatus = ({ error = false } = {}) => (
    <div className="xpv-shell with-social-chrome" ref={shellRef}>
      <SocialHubChrome
        brandKicker="XP Roadmap"
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        sideSections={[{
          label: 'Roadmap',
          items: [
            { label: 'Level path', icon: Map, active: true, disabled: true },
            { label: 'Weekly quests', icon: Target, disabled: true },
            { label: 'Rewards', icon: Gift, disabled: true },
          ],
        }]}
        footerItems={[
          { icon: User, label: displayName, path: '/profile' },
          { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard-cerbyl' },
        ]}
        sidebarLead={(
          <button className="xpv-side-primary" type="button" disabled>
            <Rocket size={15} />
            <span>Continue journey</span>
          </button>
        )}
      >
        <div className="xpv-content xpv-status-content">
          <section className={`xpv-status-panel ${error ? 'is-error' : ''}`} aria-live="polite">
            <div className="xpv-loading-mark" aria-hidden="true">
              {!error && <span />}
              <Zap size={22} />
            </div>
            <span className="xpv-kicker">{error ? 'Route interrupted' : 'Plotting progress'}</span>
            <strong>{error ? 'Progress is temporarily out of reach' : 'Mapping your next level'}</strong>
            <p>{error ? statsError : 'Loading progress, weekly goals and available rewards.'}</p>
            {error && <button type="button" onClick={retryStats}>Try again</button>}
          </section>
        </div>
      </SocialHubChrome>
    </div>
  );

  if (loading) {
    return renderStatus();
  }

  if (statsError) {
    return renderStatus({ error: true });
  }

  const nextMilestoneIndex = badgeCollection.findIndex((node) => xp < node.xp);
  const campaignProgress = (() => {
    if (badgeCollection.length < 2 || nextMilestoneIndex < 0) return 100;
    if (nextMilestoneIndex === 0) return 0;
    const previous = badgeCollection[nextMilestoneIndex - 1];
    const upcoming = badgeCollection[nextMilestoneIndex];
    const segmentProgress = (xp - previous.xp) / Math.max(1, upcoming.xp - previous.xp);
    return ((nextMilestoneIndex - 1 + Math.max(0, Math.min(1, segmentProgress))) / (badgeCollection.length - 1)) * 100;
  })();
  const getPlotX = (node) => Math.max(8, Math.min(80, node.x));
  const jumpToSection = (sectionId) => {
    setActiveSection(sectionId);
    scrollToPanel(sectionId);
  };
  const roadmapSections = [
    {
      label: 'Roadmap',
      items: [
        { label: 'Level path', icon: Map, active: activeSection === 'xpv-roadmap', onClick: () => jumpToSection('xpv-roadmap') },
        { label: 'Weekly quests', icon: Target, active: activeSection === 'xpv-quests', count: runMechanics.completedQuests, onClick: () => jumpToSection('xpv-quests') },
        { label: 'Rewards', icon: Gift, active: activeSection === 'xpv-rewards', count: masteredCount, onClick: () => jumpToSection('xpv-rewards') },
        { label: 'Topic arcs', icon: BookOpen, active: activeSection === 'xpv-topics', count: topicArcs.length, onClick: () => jumpToSection('xpv-topics') },
      ],
    },
    {
      label: 'Practice',
      items: [
        { label: 'Question bank', icon: Brain, onClick: () => navigate('/question-bank') },
        { label: 'Flashcards', icon: Layers, onClick: () => navigate('/flashcards') },
        { label: 'Notes', icon: FileText, onClick: () => navigate('/notes') },
      ],
    },
  ];

  return (
    <div className="xpv-shell with-social-chrome" ref={shellRef}>
      {levelWave && <div className="xpv-level-wave" aria-hidden="true" />}
      <SocialHubChrome
        brandKicker="XP Roadmap"
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        sideSections={roadmapSections}
        collapsedLeadItems={[{ icon: nextNode ? Rocket : Trophy, label: nextNode ? 'Continue journey' : 'View mastery', onClick: openNextMission }]}
        footerItems={[
          { icon: User, label: displayName, path: '/profile' },
          { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard-cerbyl' },
        ]}
        sidebarLead={(
          <button className="xpv-side-primary" type="button" onClick={openNextMission}>
            {nextNode ? <Rocket size={15} /> : <Trophy size={15} />}
            <span>{nextNode ? 'Continue journey' : 'View mastery'}</span>
          </button>
        )}
        sidebarTail={(
          <div className="xpv-sidebar-progress">
            <div><span>Level {level}</span><strong>{xp.toLocaleString()} XP</strong></div>
            <div className="xpv-progress-line" role="progressbar" aria-label={`Progress to level ${level + 1}`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(levelProgress)}>
              <i style={{ width: `${levelProgress}%` }} />
            </div>
            <small>{Math.max(0, levelWindow.end - xp).toLocaleString()} XP to level {level + 1}</small>
          </div>
        )}
      >
        <div className="xpv-content">
          <section className="xpv-hero" id="xpv-roadmap">
            <div className="xpv-hero-copy">
              <span className="xpv-kicker">XP Roadmap</span>
              <h1>Level {level} is taking shape.</h1>
              <p>
                {nextNode
                  ? `Your learning has built four layers. ${Math.max(0, nextNode.xp - xp).toLocaleString()} XP completes the next one.`
                  : 'The current structure is complete. Keep learning to reveal the next set of milestones.'}
              </p>
              <button type="button" className="xpv-hero-action" onClick={openNextMission}>
                {nextNode ? `Build toward ${nextNode.title}` : 'Review mastery'}
                <ChevronRight size={15} />
              </button>
            </div>

            <div
              className="xpv-xp-instrument"
              aria-label={`Level ${level}, ${xp.toLocaleString()} experience points, ${Math.round(levelProgress)} percent to level ${level + 1}`}
            >
              <div className="xpv-instrument-coordinate" aria-hidden="true">
                <span>X {String(xp).padStart(4, '0')}</span>
                <span>L {String(level).padStart(2, '0')}</span>
              </div>
              <div className="xpv-level-stack" aria-hidden="true">
                {Array.from({ length: 5 }, (_, index) => {
                  const plateLevel = Math.max(1, level - 3 + index);
                  const plateState = plateLevel < level ? 'mastered' : plateLevel === level ? 'active' : 'future';
                  return <span key={plateLevel} className={plateState} style={{ '--plate': index }} />;
                })}
                <i style={{ '--charge': `${levelProgress}%` }} />
              </div>
              <div className="xpv-instrument-readout">
                <span>Current form</span>
                <strong>{String(level).padStart(2, '0')}</strong>
                <small>{xp.toLocaleString()} XP</small>
              </div>
              <button type="button" onClick={openNextMission}>
                <span>Next layer</span>
                <strong>{nextNode?.title || 'Mastery'}</strong>
                <small>{nextNode ? `${Math.max(0, nextNode.xp - xp).toLocaleString()} XP left` : 'Complete'}</small>
              </button>
            </div>
          </section>

          <section className="xpv-run-strip" aria-label="Current run">
            <div>
              <Flame size={17} />
              <span>Current streak</span>
              <strong>{stats?.current_streak || 0} {(stats?.current_streak || 0) === 1 ? 'day' : 'days'}</strong>
            </div>
            <div><Zap size={17} /><span>XP multiplier</span><strong>x{runMechanics.combo}</strong></div>
            <div><Target size={17} /><span>Weekly completion</span><strong>{runMechanics.averageQuestProgress}%</strong></div>
            <div><Clock size={17} /><span>Weekly reset</span><strong>{decayLabel}</strong></div>
          </section>

          <section className="xpv-map-panel" aria-labelledby="xpv-map-title">
            <div className="xpv-section-head">
              <div>
                <span>Milestone field</span>
                <h2 id="xpv-map-title">Your route bends with the work you finish.</h2>
              </div>
              <p>{masteredCount} of {badgeCollection.length} milestones reached</p>
            </div>

            <div
              className="xpv-route-layout"
            >
              <div
              className="xpv-route-field"
              role="group"
              aria-label={`Campaign milestones, ${Math.round(campaignProgress)} percent complete`}
              >
                <div className="xpv-route-contours" aria-hidden="true" />
                {badgeCollection.slice(0, -1).map((node, index) => {
                  const next = badgeCollection[index + 1];
                  const nodeX = getPlotX(node);
                  const nextX = getPlotX(next);
                  const deltaX = nextX - nodeX;
                  const deltaY = next.y - node.y;
                  const width = Math.hypot(deltaX, deltaY);
                  const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
                  const complete = node.state === 'mastered' && next.state !== 'locked';
                  return (
                    <span
                      key={`${node.id}-route`}
                      className={`xpv-route-segment ${complete ? 'complete' : ''}`}
                      style={{ left: `${nodeX}%`, top: `${node.y}%`, width: `${width}%`, transform: `rotate(${angle}deg)` }}
                      aria-hidden="true"
                    />
                  );
                })}
                {badgeCollection.map((node, index) => {
                  const Icon = node.icon;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      className={`xpv-route-node ${node.state} type-${node.type}`}
                      style={{ left: `${getPlotX(node)}%`, top: `${node.y}%` }}
                      onClick={(event) => handleNodeClick(node, node.state, event)}
                      aria-label={`${node.title}, ${node.state}, ${node.xp.toLocaleString()} XP`}
                    >
                      <span className="xpv-route-index">{String(index + 1).padStart(2, '0')}</span>
                      <span className="xpv-route-core">
                        {node.state === 'locked' ? <Lock size={17} /> : node.state === 'mastered' ? <CheckCircle size={17} /> : <Icon size={17} />}
                      </span>
                      <span className="xpv-route-copy"><strong>{node.title}</strong><small>{node.xp.toLocaleString()} XP</small></span>
                    </button>
                  );
                })}
              </div>

              <aside className="xpv-route-brief">
                <div className="xpv-route-brief-mark"><Target size={21} /></div>
                <span>Current coordinate</span>
                <h3>{nextNode?.title || 'Mastery reached'}</h3>
                <p>{nextNode ? `${Math.max(0, nextNode.xp - xp).toLocaleString()} XP remains before ${nextNode.reward} is added to your roadmap.` : 'Every current milestone has been reached.'}</p>
                <dl>
                  <div><dt>Position</dt><dd>{masteredCount + 1}/{badgeCollection.length}</dd></div>
                  <div><dt>Reward</dt><dd>{nextNode?.reward || 'Complete'}</dd></div>
                </dl>
                <button type="button" onClick={openNextMission}>
                  {nextNode ? nextMissionAction.label : 'Open analytics'}
                  <ChevronRight size={15} />
                </button>
              </aside>
            </div>
          </section>

          <section className="xpv-focus-grid" id="xpv-quests">
            <div className="xpv-weekly-board">
              <div className="xpv-panel-label"><Target size={16} /><span>This week</span><strong>{runMechanics.completedQuests}/4 complete</strong></div>
              <div className="xpv-quest-list">
                {quests.length === 0 && (
                  <div className="xpv-empty-state">
                    <strong>No weekly activity yet</strong>
                    <span>Complete a learning activity to start this week.</span>
                    <button type="button" onClick={() => navigate('/dashboard-cerbyl')}>Choose an activity</button>
                  </div>
                )}
                {quests.map((quest) => {
                  const Icon = quest.icon;
                  return (
                    <div key={quest.id} className={`xpv-quest-row ${quest.done ? 'done' : ''}`}>
                      <Icon size={17} />
                      <div><strong>{quest.label}</strong><span>{quest.current} of {quest.goal}</span></div>
                      <small>{quest.done ? 'Done' : `${quest.progress}%`}</small>
                      <i
                        role="progressbar"
                        aria-label={`${quest.label} weekly progress`}
                        aria-valuemin="0"
                        aria-valuemax="100"
                        aria-valuenow={quest.progress}
                      >
                        <span style={{ width: `${quest.progress}%` }} />
                      </i>
                    </div>
                  );
                })}
              </div>
              <div className="xpv-boss-row">
                <Crown size={19} />
                <div><strong>Weekly boost</strong><span>Finish all four quest lanes to add a boost charge.</span></div>
                <b>{runMechanics.completedQuests}/4</b>
              </div>
            </div>
          </section>

          <section className="xpv-tools-grid" aria-label="Momentum tools">
            <div className="xpv-streak-panel">
              <div className="xpv-panel-label"><Flame size={16} /><span>Seven day chain</span></div>
              <h2>Keep the learning rhythm intact.</h2>
              <div className="xpv-chain" aria-label={`${stats?.current_streak || 0} day streak`}>
                {streakChain.map((link, index) => (
                  <span key={link.id} className={`${link.active ? 'active' : ''} ${link.current ? 'current' : ''}`}>
                    <b>{index + 1}</b><small>{WEEKDAYS[index]}</small>
                  </span>
                ))}
              </div>
            </div>

            <div className="xpv-power-panel">
              <div className="xpv-panel-label"><Shield size={16} /><span>Available tools</span></div>
              <div className="xpv-power-grid">
                {powerUps.map((power) => {
                  const Icon = power.icon;
                  return (
                    <button
                      key={power.id}
                      type="button"
                      className={`${power.charged ? 'charged' : ''} ${armedPowerUp === power.id ? 'armed' : ''}`}
                      onClick={() => {
                        if (armedPowerUp === power.id) {
                          setArmedPowerUp(null);
                          handleUsePowerUp(power);
                        } else {
                          setArmedPowerUp(power.id);
                        }
                      }}
                      disabled={power.disabled || powerUpLoading === power.id}
                      aria-pressed={armedPowerUp === power.id}
                      aria-label={`${armedPowerUp === power.id ? 'Confirm ' : ''}${power.label}: ${power.description}`}
                    >
                      <Icon size={17} />
                      <span>
                        <strong>{powerUpLoading === power.id ? 'Working' : (armedPowerUp === power.id ? 'Confirm' : power.value)}</strong>
                        <small>{power.label}</small>
                      </span>
                      <em>{power.description}</em>
                    </button>
                  );
                })}
              </div>
              {powerNotice && <div className={`xpv-power-notice ${powerNotice.type}`} role="status">{powerNotice.text}</div>}
            </div>
          </section>

          <section className="xpv-rewards-panel" id="xpv-rewards">
            <div className="xpv-section-head">
              <div><span>Rewards</span><h2>Your unlocks, in the order they become useful.</h2></div>
            </div>
            <div className="xpv-reward-layout">
              <div className="xpv-season-track">
                {seasonTrack.map((reward) => (
                  <div key={reward.id} className={reward.unlocked ? 'unlocked' : ''}>
                    <span>{reward.unlocked ? <CheckCircle size={16} /> : <Lock size={16} />}</span>
                    <strong>{reward.label}</strong>
                    <small>{reward.threshold.toLocaleString()} XP</small>
                  </div>
                ))}
              </div>
              <div className="xpv-reward-ledger">
                <div className="xpv-panel-label"><Star size={16} /><span>Next rewards</span></div>
                {nextRewards.length === 0 && <p>Every current campaign reward is unlocked.</p>}
                {nextRewards.map((reward) => (
                  <button key={reward.id} type="button" onClick={() => setSelectedNode({ ...reward, state: badgeCollection.find((node) => node.id === reward.id)?.state || 'locked' })}>
                    <Gift size={16} />
                    <span><strong>{reward.reward}</strong><small>{reward.title}</small></span>
                    <b>{reward.xp.toLocaleString()} XP</b>
                  </button>
                ))}
                <div className="xpv-vault-list">
                  {chestInventory.map((chest) => (
                    <button key={chest.id} type="button" className={chest.state} onClick={() => setSelectedNode(chest)}>
                      <Package size={16} />
                      <span>{chest.reward}</span>
                      {chest.state === 'mastered' ? <CheckCircle size={14} /> : <Lock size={14} />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="xpv-topic-panel" id="xpv-topics">
            <div className="xpv-section-head">
              <div><span>Personalized topic arcs</span><h2>Progress tied to what you actually study.</h2></div>
              {roadmapLoading && <p role="status">Refreshing recommendations</p>}
            </div>
            {!roadmapLoading && roadmapError ? (
              <div className="xpv-topic-empty">
                <Brain size={24} />
                <div><strong>Topic arcs could not be refreshed</strong><span>{roadmapError}</span></div>
                <button type="button" onClick={retryRoadmap}>Try again</button>
              </div>
            ) : topicArcs.length === 0 ? (
              <div className="xpv-topic-empty">
                <BookOpen size={24} />
                <div><strong>No topic arcs yet</strong><span>Explore or practice a topic and its milestones will appear here.</span></div>
                <button type="button" onClick={() => navigate('/search-hub')}>Explore a topic</button>
              </div>
            ) : (
              <div className="xpv-topic-arcs">
                {topicArcs.map((arc) => (
                  <article key={arc.topic} className="xpv-topic-arc">
                    <div><span>{arc.category || 'Study topic'}</span><strong>{arc.topic}</strong></div>
                    <p>{arc.completed} of {arc.total} milestones complete</p>
                    <div
                      role="progressbar"
                      aria-label={`${arc.topic} topic progress`}
                      aria-valuemin="0"
                      aria-valuemax="100"
                      aria-valuenow={arc.progress}
                    >
                      <i style={{ width: `${arc.progress}%` }} />
                    </div>
                    <small>{arc.activityCount || 0} learning signals</small>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="xpv-badge-panel">
            <div className="xpv-section-head">
              <div><span>Milestone archive</span><h2>Every mark tells you what it took to earn it.</h2></div>
            </div>
            <div className="xpv-badge-grid">
              {badgeCollection.map((badge) => {
                const Icon = badge.icon;
                return (
                  <button key={badge.id} type="button" className={badge.state} onClick={(event) => handleNodeClick(badge, badge.state, event)}>
                    <span>{badge.state === 'locked' ? <Lock size={17} /> : <Icon size={17} />}</span>
                    <strong>{badge.title}</strong>
                    <small>{badge.reward}</small>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </SocialHubChrome>

      {xpBursts.map((burst) => (
        <span key={burst.id} className="xpv-xp-burst" style={{ left: burst.x, top: burst.y }}>
          +{Math.max(10, Math.round(burst.amount / 10))} XP
        </span>
      ))}

      {selectedNodeDetails && (
        <div className="xpv-drawer-layer">
          <button className="xpv-drawer-backdrop" type="button" aria-label="Close milestone details" onClick={() => setSelectedNode(null)} />
          <aside ref={drawerRef} className="xpv-drawer" role="dialog" aria-modal="true" aria-labelledby="xpv-drawer-title">
            <div className="xpv-drawer-head">
              <div>
                <span>{selectedNodeDetails.state === 'mastered' ? 'Completed milestone' : selectedNodeDetails.state === 'active' ? 'Current milestone' : 'Future milestone'}</span>
                <strong id="xpv-drawer-title">{selectedNodeDetails.title}</strong>
              </div>
              <button ref={drawerCloseRef} type="button" onClick={() => setSelectedNode(null)} aria-label="Close milestone details"><X size={18} /></button>
            </div>

            <div className="xpv-drawer-reward">
              <Gift size={18} />
              <div><span>Unlock</span><strong>{selectedNodeDetails.reward}</strong></div>
              {selectedNodeDetails.delta > 0 && <small>{selectedNodeDetails.delta.toLocaleString()} XP left</small>}
            </div>

            <div className="xpv-drawer-lanes">
              {selectedNodeDetails.questSummary.map((lane) => (
                <div key={lane.id} className={lane.done ? 'done' : ''}><span>{lane.label}</span><strong>{lane.progress}%</strong></div>
              ))}
            </div>

            <div className="xpv-drawer-recommendations">
              <span>{roadmapLoading ? 'Updating recommendations' : 'Choose a study focus'}</span>
              <div>
                {missionRecommendations.map((recommendation) => (
                  <button key={recommendation.topic} type="button" className={recommendation.topic === activeMissionTopic ? 'active' : ''} onClick={() => setSelectedMissionTopic(recommendation.topic)}>
                    <strong>{recommendation.topic}</strong>
                    <small>{recommendation.reason}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className={`xpv-drawer-action-note ${missionNotice?.type || ''}`} role="status">
              {missionNotice
                ? missionNotice.text
                : (selectedNodeDetails.state === 'locked' && nextNode
                  ? `This milestone is locked. Continue from ${nextNode.title} using ${activeMissionTopic}.`
                  : `${selectedMissionAction.label} will use ${activeMissionTopic}.`)}
            </div>

            <button type="button" className="xpv-drawer-cta" onClick={handleContinueMission} disabled={missionLoading}>
              {missionLoading ? 'Preparing activity' : selectedCtaLabel}
              <ChevronRight size={15} />
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}
