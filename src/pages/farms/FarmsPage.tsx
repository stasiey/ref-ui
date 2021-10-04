import React, { useEffect, useState } from 'react';
import Modal from 'react-modal';
import { Card } from '~components/card/Card';
import Alert from '~components/alert/Alert';
import InputAmount from '~components/forms/InputAmount';
import {
  GreenButton,
  BorderButton,
  WithdrawButton,
} from '~components/button/Button';
import {
  getFarms,
  claimRewardByFarm,
  FarmInfo,
  getFarmInfo,
  getStakedListByAccountId,
  getRewards,
  getSeeds,
  DEFAULT_PAGE_LIMIT,
} from '~services/farm';
import {
  stake,
  unstake,
  LP_TOKEN_DECIMALS,
  withdrawReward,
} from '~services/m-token';
import {
  formatWithCommas,
  toPrecision,
  toReadableNumber,
} from '~utils/numbers';
import { mftGetBalance } from '~services/mft-contract';
import { wallet } from '~services/near';
import Loading from '~components/layout/Loading';
import { ConnectToNearBtn } from '~components/deposit/Deposit';
import { useTokens } from '~state/token';
import { Info } from '~components/icon/Info';
import ReactTooltip from 'react-tooltip';
import { getMftTokenId, toRealSymbol } from '~utils/token';
import ReactModal from 'react-modal';
import { isMobile } from '~utils/device';
import ClipLoader from 'react-spinners/ClipLoader';
import { ftGetTokenMetadata, TokenMetadata } from '~services/ft-contract';
import { getTokenPriceList } from '~services/indexer';
import Countdown, { zeroPad } from 'react-countdown';
import moment from 'moment';
import { Link } from 'react-router-dom';
import _ from 'lodash';
import { FormattedMessage, useIntl } from 'react-intl';
import parse from 'html-react-parser';

export function FarmsPage() {
  const [unclaimedFarmsIsLoading, setUnclaimedFarmsIsLoading] = useState(false);
  const [farms, setFarms] = useState<FarmInfo[]>([]);
  const [error, setError] = useState<Error>();
  const [stakedList, setStakedList] = useState<Record<string, string>>({});
  const [rewardList, setRewardList] = useState<Record<string, string>>({});
  const [tokenPriceList, setTokenPriceList] = useState<any>();
  const [seeds, setSeeds] = useState<Record<string, string>>({});
  const page = 1;
  const perPage = DEFAULT_PAGE_LIMIT;
  const intl = useIntl();

  async function loadFarmInfoList() {
    setUnclaimedFarmsIsLoading(true);
    const isSignedIn: boolean = wallet.isSignedIn();

    const emptyObj = async () => {
      return {};
    };
    let Params: [
      Promise<Record<string, string>>,
      Promise<Record<string, string>>,
      Promise<any>,
      Promise<Record<string, string>>
    ];

    if (isSignedIn) {
      Params = [
        getStakedListByAccountId({}),
        getRewards({}),
        getTokenPriceList(),
        getSeeds({}),
      ];
    } else {
      Params = [emptyObj(), emptyObj(), getTokenPriceList(), getSeeds({})];
    }

    const resolvedParams: [
      Record<string, string>,
      Record<string, string>,
      any,
      Record<string, string>
    ] = await Promise.all(Params);

    const stakedList: Record<string, string> = resolvedParams[0];
    const rewardList: Record<string, string> = resolvedParams[1];

    const tokenPriceList: any = resolvedParams[2];

    const seeds: Record<string, string> = resolvedParams[3];

    setStakedList(stakedList);
    setRewardList(rewardList);
    setTokenPriceList(tokenPriceList);
    setSeeds(seeds);

    getFarms({
      page,
      perPage,
      stakedList,
      rewardList,
      tokenPriceList,
      seeds,
    }).then((farms) => {
      setUnclaimedFarmsIsLoading(false);
      farms = _.orderBy(farms, ['farm_status'], ['desc']);
      setFarms(farms);
    });
  }
  useEffect(() => {
    loadFarmInfoList().then();
  }, []);

  return (
    <>
      <div className="w-1/3 xs:w-full md:w-full flex m-auto justify-center">
        {error ? <Alert level="error" message={error.message} /> : null}
      </div>
      <div className="flex gaps-x-8 px-5 -mt-12 xs:flex-col xs:mt-8 md:flex-col md:mt-8">
        <div className="w-96 mr-4 relative xs:w-full md:w-full">
          <div className="text-green-400 text-5xl px-7 xs:text-center md:text-center">
            <FormattedMessage id="farms" defaultMessage="Farms" />
          </div>
          <div className="text-whiteOpacity85 text-xs py-4 p-7">
            <FormattedMessage
              id="stake_your_liquidity_provider_LP_tokens_to_earn_rewards"
              defaultMessage="Stake your liquidity provider (LP) tokens to earn rewards"
            />
            !
          </div>
          {unclaimedFarmsIsLoading ? (
            <Loading />
          ) : (
            <div className="bg-greenOpacity100 text-whiteOpacity85 rounded-xl p-7">
              <div className="text-xl">
                <FormattedMessage
                  id="your_rewards"
                  defaultMessage="Your Rewards"
                />
              </div>
              <div className="text-sm pt-2 text-gray-50">
                {parse(intl.formatMessage({ id: 'farmRewardsCopy' }))}
              </div>
              <div className="text-xs pt-2">
                {Object.entries(rewardList).map((rewardToken: any, index) => (
                  <ClaimView key={index} data={rewardToken} />
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex-grow xs:flex-none">
          <div className="overflow-auto relative mt-8 pb-4">
            {unclaimedFarmsIsLoading ? (
              <Loading />
            ) : (
              <div className="grid grid-cols-3 gap-4 xs:grid-cols-1 md:grid-cols-1">
                {farms.map((farm) => (
                  <FarmView
                    key={farm.farm_id}
                    farmData={farm}
                    stakedList={stakedList}
                    rewardList={rewardList}
                    tokenPriceList={tokenPriceList}
                    seeds={seeds}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function ClaimView({ data }: { data: any }) {
  const [disableWithdraw, setDisableWithdraw] = useState<boolean>(false);
  const [withdrawLoading, setWithdrawLoading] = useState<boolean>(false);
  const [token, setToken] = useState<TokenMetadata>();
  const withdrawLoadingColor = '#ffffff';
  const withdrawLoadingSize = 12;

  useEffect(() => {
    ftGetTokenMetadata(data[0]).then(setToken);
    if (data[1] === '0') {
      setDisableWithdraw(true);
    }
  }, [data]);

  function withdrawRewards() {
    setDisableWithdraw(true);
    setWithdrawLoading(true);
    withdrawReward({
      token_id: data[0],
      amount: toReadableNumber(token.decimals, data[1]),
      token: token,
    });
  }

  if (!token) return Loading();

  return (
    <div>
      <div
        key={data.farm_id}
        className="py-2 flex items-center justify-between"
      >
        <div>
          {toPrecision(toReadableNumber(token.decimals, data[1]), 6)}{' '}
          {toRealSymbol(token.symbol)}
        </div>
        <div>
          {wallet.isSignedIn() ? (
            <WithdrawButton
              onClick={withdrawRewards}
              disabled={disableWithdraw}
            >
              <div>
                <ClipLoader
                  color={withdrawLoadingColor}
                  loading={withdrawLoading}
                  size={withdrawLoadingSize}
                />
              </div>
              {withdrawLoading ? null : (
                <div>
                  <FormattedMessage id="withdraw" defaultMessage="Withdraw" />
                </div>
              )}
            </WithdrawButton>
          ) : (
            <ConnectToNearBtn />
          )}
        </div>
      </div>
    </div>
  );
}

function FarmView({
  farmData,
  stakedList,
  rewardList,
  tokenPriceList,
  seeds,
}: {
  farmData: FarmInfo;
  stakedList: Record<string, string>;
  rewardList: Record<string, string>;
  tokenPriceList: any;
  seeds: Record<string, string>;
}) {
  const [farmsIsLoading, setFarmsIsLoading] = useState(false);
  const [withdrawVisible, setWithdrawVisible] = useState(false);
  const [unstakeVisible, setUnstakeVisible] = useState(false);
  const [stakeVisible, setStakeVisible] = useState(false);
  const [stakeBalance, setStakeBalance] = useState('0');
  const [error, setError] = useState<Error>();
  const [ended, setEnded] = useState<boolean>(false);
  const [pending, setPending] = useState<boolean>(false);
  const [disableClaim, setDisableClaim] = useState<boolean>(false);
  const [data, setData] = useState<FarmInfo>();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [claimLoading, setClaimLoading] = useState(false);

  const clipColor = '#00c08b';
  const clipSize = 12;
  const claimLoadingColor = '#ffffff';
  const claimLoadingSize = 12;
  const refreshTime = 120000;

  const PoolId = farmData.lpTokenId;
  const tokens = useTokens(farmData?.tokenIds);

  const intl = useIntl();

  const renderer = (countdown: any) => {
    if (countdown.completed) {
      return null;
    } else {
      return (
        <>
          <div>
            <FormattedMessage id="start_in" defaultMessage="Start in" />
          </div>
          <div>
            <span className="text-green-600">{countdown.days}</span> days{' '}
            <span className="text-green-600">
              {zeroPad(countdown.hours)}:{zeroPad(countdown.minutes)}:
              {zeroPad(countdown.seconds)}
            </span>
          </div>
        </>
      );
    }
  };

  useEffect(() => {
    setEnded(farmData.farm_status === 'Ended');
    setPending(farmData.farm_status === 'Pending');
    setData(farmData);
    setLoading(false);
  }, [farmData]);

  useEffect(() => {
    if (count > 0) {
      setLoading(true);
      getFarmInfo(
        farmData,
        farmData.pool,
        stakedList[farmData.seed_id],
        tokenPriceList,
        rewardList[farmData.reward_token],
        seeds[farmData.seed_id],
        farmData.lpTokenId
      ).then((data) => {
        setData(data);
        setLoading(false);
      });
    }

    if (data) {
      setEnded(data.farm_status === 'Ended');
      setPending(data.farm_status === 'Pending');
    }

    const id = setInterval(() => {
      setCount(count + 1);
    }, refreshTime);
    return () => clearInterval(id);
  }, [count]);

  async function showUnstakeModal() {
    setUnstakeVisible(true);
  }

  async function showStakeModal() {
    const b = await mftGetBalance(getMftTokenId(data.lpTokenId));
    setStakeBalance(toReadableNumber(LP_TOKEN_DECIMALS, b));
    setStakeVisible(true);
  }

  function showWithDraw() {
    setWithdrawVisible(true);
  }

  function claimReward(farm_id: string) {
    setDisableClaim(true);
    setClaimLoading(true);
    claimRewardByFarm(farm_id)
      .then(() => {
        window.location.reload();
      })
      .catch((error) => {
        setDisableClaim(false);
        setError(error);
      });
  }

  function farmStarted() {
    return moment.unix(data.start_at).valueOf() < moment().valueOf();
  }

  if (!tokens || tokens.length < 2 || farmsIsLoading) return <Loading />;

  tokens.sort((a, b) => {
    if (a.symbol === 'wNEAR') return 1;
    if (b.symbol === 'wNEAR') return -1;
    return a.symbol > b.symbol ? 1 : -1;
  });

  const images = tokens.map((token, index) => {
    const { icon, id } = token;
    if (icon)
      return (
        <img
          key={id}
          className="h-8 w-8 xs:h-6 xs:w-6 rounded-full"
          src={icon}
        />
      );
    return (
      <div key={id} className="h-8 w-8 xs:h-6 xs:w-6 rounded-full border"></div>
    );
  });

  const symbols = tokens.map((token, index) => {
    const { symbol } = token;
    const hLine = index === 1 ? '' : '-';
    return `${toRealSymbol(symbol)}${hLine}`;
  });

  return (
    <Card width="w-full" className="self-start" padding={'p-0'}>
      <div
        className={`${
          ended ? 'rounded-t-xl bg-gray-300 bg-opacity-50' : ''
        } border-b flex items-center p-6 relative overflow-hidden flex-wrap`}
      >
        <div className="flex items-center justify-center">
          <div className="h-9 xs:h-6">
            <div className="w-18 xs:w-12 flex items-center justify-between">
              {images}
            </div>
          </div>
        </div>
        <div className="pl-2 order-2 lg:ml-auto xl:m-0">
          <div>
            <a href={`/pool/${PoolId}`} className="xs:text-sm">
              {symbols}
            </a>
            <p className="text-xs text-gray-400">
              <FormattedMessage id="earn" defaultMessage="Earn" />{' '}
              {toRealSymbol(data?.rewardToken?.symbol)}
            </p>
          </div>
        </div>
        {ended ? (
          <div className="ended status-bar">
            <FormattedMessage id="ended" defaultMessage="ENDED" />
          </div>
        ) : null}
        {pending ? (
          <div className="pending status-bar">
            <FormattedMessage id="pending" defaultMessage="PENDING" />
          </div>
        ) : null}
        <div className="ml-auto order-3 lg:w-full lg:mt-2 xl:w-auto xl:mt-0">
          <div className="inline-block">
            <Link
              title={intl.formatMessage({ id: 'view_pool' })}
              to={{
                pathname: `/pool/${PoolId}`,
                state: { backToFarms: true },
              }}
              className="hover:text-green-500 text-lg xs:text-sm font-bold p-2 cursor-pointer text-green-500"
            >
              <span>
                <FormattedMessage id="view_pool" defaultMessage="View Pool" />
              </span>
            </Link>
          </div>
          <div className="inline-block">
            <div
              data-type="dark"
              data-place="bottom"
              data-multiline={true}
              data-tip={intl.formatMessage({ id: 'getLPTokenCopy' })}
            >
              <Info />
            </div>
            <ReactTooltip />
          </div>
        </div>
      </div>
      <div className="info-list p-6" style={{ minHeight: '12rem' }}>
        <div className="text-center max-w-2xl">
          {error ? <Alert level="error" message={error.message} /> : null}
        </div>
        <div className="py-2">
          {data.userStaked !== '0' ? (
            <div className="flex items-center justify-between text-xs py-2">
              <div>
                <FormattedMessage
                  id="your_shares"
                  defaultMessage="Your Shares"
                />
              </div>
              <div>{toPrecision(data.userStaked, 6)}</div>
            </div>
          ) : null}
          {data.userStaked === '0' ? (
            <div className="flex items-center justify-between text-xs py-2">
              <div>
                <FormattedMessage
                  id="rewards_per_week"
                  defaultMessage="Rewards per week"
                />
              </div>
              <div>
                {data.rewardsPerWeek} {toRealSymbol(data?.rewardToken?.symbol)}
              </div>
            </div>
          ) : null}
          <div className="flex items-center justify-between text-xs py-2">
            <div>
              <FormattedMessage id="apr" defaultMessage="APR" />
            </div>
            <div>
              <ClipLoader color={clipColor} loading={loading} size={clipSize} />
            </div>
            {loading ? null : (
              <div>{`${data.apr === '0' ? '-' : `${data.apr}%`}`}</div>
            )}
          </div>
          <div className="flex items-center justify-between text-xs py-2">
            <div>
              <FormattedMessage
                id="total_staked"
                defaultMessage="Total Staked"
              />
            </div>
            <div>
              <ClipLoader color={clipColor} loading={loading} size={clipSize} />
            </div>
            {loading ? null : (
              <div>{`${
                data.totalStaked === 0
                  ? '-'
                  : `$${formatWithCommas(data.totalStaked.toString())}`
              }`}</div>
            )}
          </div>
          <div className="flex items-center justify-between text-xs py-2">
            <div>
              <FormattedMessage
                id="unclaimed_rewards"
                defaultMessage="Unclaimed rewards"
              />
            </div>
            <div>
              <ClipLoader color={clipColor} loading={loading} size={clipSize} />
            </div>
            {loading ? null : (
              <div>
                {data.userUnclaimedReward}{' '}
                {toRealSymbol(data.rewardToken.symbol)}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-xs py-2">
            {farmStarted() ? (
              <>
                <div>
                  <FormattedMessage
                    id="started_at"
                    defaultMessage="Started at"
                  />
                </div>
                <div>
                  {moment.unix(data.start_at).format('YYYY-MM-DD HH:mm:ss')}
                </div>
              </>
            ) : (
              <Countdown
                date={moment.unix(data.start_at).valueOf()}
                renderer={renderer}
              />
            )}
          </div>
        </div>
        <div>
          {wallet.isSignedIn() ? (
            <div className="flex flex-wrap gap-2 justify-center mt-4">
              {data.userUnclaimedReward !== '0' ? (
                <GreenButton
                  onClick={() => claimReward(data.farm_id)}
                  disabled={disableClaim}
                >
                  <div className="w-16 text-xs">
                    <ClipLoader
                      color={claimLoadingColor}
                      loading={claimLoading}
                      size={claimLoadingSize}
                    />
                    {claimLoading ? null : (
                      <div>
                        <FormattedMessage id="claim" defaultMessage="Claim" />
                      </div>
                    )}
                  </div>
                </GreenButton>
              ) : null}
              {data.userStaked !== '0' ? (
                <BorderButton onClick={() => showUnstakeModal()}>
                  <div className="w-16 text-xs text-greenLight">
                    <FormattedMessage id="unstake" defaultMessage="Unstake" />
                  </div>
                </BorderButton>
              ) : null}
              <BorderButton onClick={() => showStakeModal()} disabled={ended}>
                <div className="w-16 text-xs text-greenLight">
                  <FormattedMessage id="stake" defaultMessage="Stake" />
                </div>
              </BorderButton>
            </div>
          ) : (
            <ConnectToNearBtn />
          )}
        </div>
      </div>

      <ActionModal
        isOpen={unstakeVisible}
        onRequestClose={() => setUnstakeVisible(false)}
        title={intl.formatMessage({ id: 'unstake' })}
        btnText={intl.formatMessage({ id: 'unstake' })}
        max={data.userStaked}
        onSubmit={(amount) => {
          unstake({
            seed_id: data.seed_id,
            amount,
          }).catch(setError);
        }}
      />

      <ActionModal
        isOpen={withdrawVisible}
        onRequestClose={() => setWithdrawVisible(false)}
        title={intl.formatMessage({ id: 'withdraw' })}
        btnText={intl.formatMessage({ id: 'withdraw' })}
        max={data.rewardNumber}
        onSubmit={(amount) => {
          withdrawReward({
            token_id: data.reward_token,
            amount,
            token: data.rewardToken,
          }).catch(setError);
        }}
      />

      <ActionModal
        isOpen={stakeVisible}
        onRequestClose={() => {
          setStakeVisible(false);
        }}
        title={intl.formatMessage({ id: 'stake' })}
        btnText={intl.formatMessage({ id: 'stake' })}
        max={stakeBalance}
        onSubmit={(amount) => {
          stake({ token_id: getMftTokenId(data.lpTokenId), amount }).catch(
            setError
          );
        }}
      />
    </Card>
  );
}

function ActionModal(
  props: ReactModal.Props & {
    title?: string;
    btnText?: string;
    max: string;
    onSubmit: (amount: string) => void;
  }
) {
  const { max } = props;
  const [amount, setAmount] = useState<string>('');

  const cardWidth = isMobile() ? '75vw' : '25vw';

  return (
    <Modal {...props}>
      <Card style={{ width: cardWidth }}>
        <div className="text-sm text-gray-800 font-semibold pb-4">
          {props.title}
        </div>
        <div>
          <div className="flex justify-end text-xs font-semibold pb-2.5">
            <span className={`${max === '0' ? 'text-gray-400' : null}`}>
              <FormattedMessage id="balance" defaultMessage="Balance" />:
              {toPrecision(max, 6)}
            </span>
          </div>
          <div className="flex bg-inputBg relative overflow-hidden rounded-lg align-center my-2 border">
            <InputAmount
              className="flex-grow"
              maxBorder={false}
              max={max}
              value={amount}
              onChangeAmount={setAmount}
            />
          </div>
        </div>
        <div className="flex items-center justify-center pt-5">
          <GreenButton onClick={() => props.onSubmit(amount)}>
            {props.btnText}
          </GreenButton>
        </div>
      </Card>
    </Modal>
  );
}
